import { and, count, desc, eq, ilike, sql } from "drizzle-orm";
import { carriers, customers, db, orderItems, orders, paymentTerms, products, representatives } from "@workspace/db";
import { discountService, multiplyDecimal, sumMoney } from "./discount-service";
import { pricingService } from "./pricing-service";

export class OrderBusinessError extends Error {
  constructor(public readonly code: string, message = code) { super(message); this.name = "OrderBusinessError"; }
}
type Actor = { id: string; role: "ADMIN" | "REPRESENTATIVE"; representativeId?: string };
type Discounts = Pick<typeof orders.$inferInsert, "discount1" | "discount2" | "discount3" | "discount4">;
const discountsOf = (order: Discounts) => [order.discount1, order.discount2, order.discount3, order.discount4] as string[];
const positiveDecimal = /^\d{1,12}(?:\.\d{1,6})?$/;
const positiveQuantity = /^(?:0|[1-9]\d*)(?:\.\d{1,4})?$/;
const MAX_MONEY_INTEGER_DIGITS = 18;

function assertVersion(version: number | undefined) {
  if (!Number.isInteger(version) || version! < 1) throw new OrderBusinessError("VERSION_REQUIRED");
}
function assertPositive(value: string, kind: "quantity" | "special price") {
  const expression = kind === "quantity" ? positiveQuantity : positiveDecimal;
  if (!expression.test(value) || BigInt(value.replace(".", "")) === 0n) {
    throw new OrderBusinessError(kind === "quantity" ? "INVALID_QUANTITY" : "INVALID_SPECIAL_PRICE");
  }
}
function normalizeUnitPrice(value: string) {
  assertPositive(value, "special price");
  const [whole, fraction = ""] = value.split(".");
  return `${whole.replace(/^0+(?=\d)/, "")}.${fraction.padEnd(6, "0")}`;
}
function assertMoneyFits(value: string) {
  const [whole] = value.split(".");
  if (whole.replace(/^0+(?=\d)/, "").length > MAX_MONEY_INTEGER_DIGITS) {
    throw new OrderBusinessError("TOTAL_OUT_OF_RANGE", "O total excede o limite financeiro permitido.");
  }
}

export class DbOrderService {
  private async lockOwned(tx: any, id: string, actor: Actor, version?: number) {
    const result = await tx.execute(sql`select id from orders where id = ${id} for update`);
    if (!result.rows[0]) throw new OrderBusinessError("ORDER_NOT_FOUND");
    const [order] = await tx.select().from(orders).where(eq(orders.id, id));
    if (!order || (actor.role === "REPRESENTATIVE" && order.representativeId !== actor.representativeId)) throw new OrderBusinessError("ORDER_NOT_FOUND");
    if (actor.role === "ADMIN") throw new OrderBusinessError("READ_ONLY");
    if (order.internalStatus !== "DRAFT") throw new OrderBusinessError("ORDER_SUBMITTED");
    if (version !== undefined && order.version !== version) throw new OrderBusinessError("VERSION_CONFLICT");
    return order;
  }
  private async validateHeader(tx: any, actor: Actor, input: { customerId: string; paymentTermId: string; carrierId?: string | null }) {
    const [customer] = await tx.select().from(customers).where(eq(customers.id, input.customerId));
    if (!customer?.active || customer.representativeId !== actor.representativeId) throw new OrderBusinessError("CUSTOMER_NOT_AVAILABLE");
    const [term] = await tx.select().from(paymentTerms).where(eq(paymentTerms.id, input.paymentTermId));
    if (!term?.active) throw new OrderBusinessError("PAYMENT_TERM_NOT_AVAILABLE");
    if (input.carrierId) {
      const [carrier] = await tx.select().from(carriers).where(eq(carriers.id, input.carrierId));
      if (!carrier?.active) throw new OrderBusinessError("CARRIER_NOT_AVAILABLE");
    }
  }
  private async recalculate(tx: any, order: typeof orders.$inferSelect) {
    const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, order.id));
    const values = items.map((item: typeof orderItems.$inferSelect) => {
      const discounts = discountsOf(order);
      const netUnit = item.isSpecialPrice ? item.specialUnitPrice! : discountService.applyCascade(item.suggestedUnitPrice, discounts);
      const effective = item.isSpecialPrice ? item.specialUnitPrice! : item.suggestedUnitPrice;
      const grossTotal = multiplyDecimal(effective, 6, item.quantity, 4, 2);
      const netTotal = multiplyDecimal(netUnit, 6, item.quantity, 4, 2);
      assertMoneyFits(grossTotal);
      assertMoneyFits(netTotal);
      return { id: item.id, discount1: discounts[0], discount2: discounts[1], discount3: discounts[2], discount4: discounts[3],
        effectiveUnitPrice: effective, effectivePriceOrigin: item.isSpecialPrice ? "SPECIAL" as const : item.suggestedPriceOrigin,
        discountsApplied: !item.isSpecialPrice, netUnitPrice: netUnit,
        grossTotal, netTotal };
    });
    for (const value of values) await tx.update(orderItems).set({ ...value, updatedAt: new Date() }).where(eq(orderItems.id, value.id));
    const grossTotal = sumMoney(values.map((value: { grossTotal: string }) => value.grossTotal));
    const netTotal = sumMoney(values.map((value: { netTotal: string }) => value.netTotal));
    assertMoneyFits(grossTotal);
    assertMoneyFits(netTotal);
    await tx.update(orders).set({ grossTotal, netTotal, updatedAt: new Date(), version: order.version + 1 }).where(eq(orders.id, order.id));
  }
  async create(actor: Actor, input: { customerId: string; paymentTermId: string; carrierId?: string | null; notes?: string | null } & Discounts) {
    if (actor.role !== "REPRESENTATIVE" || !actor.representativeId) throw new OrderBusinessError("READ_ONLY");
    return db.transaction(async tx => {
      await this.validateHeader(tx, actor, input);
      const [created] = await tx.insert(orders).values({ ...input, carrierId: input.carrierId ?? null, representativeId: actor.representativeId!, createdByUserId: actor.id, grossTotal: "0.00", netTotal: "0.00" }).returning();
      return this.detailIn(tx, actor, created.id);
    });
  }
  async detail(actor: Actor, id: string) {
    return this.detailIn(db, actor, id);
  }
  private async detailIn(client: any, actor: Actor, id: string) {
    const [row] = await client.select({
      order: orders, customerName: customers.corporateName, customerErpCode: customers.erpCode,
      paymentTermDescription: paymentTerms.description, paymentTermErpCode: paymentTerms.erpCode,
      carrierName: carriers.name, carrierErpCode: carriers.erpCode,
    }).from(orders).innerJoin(customers, eq(orders.customerId, customers.id))
      .innerJoin(paymentTerms, eq(orders.paymentTermId, paymentTerms.id))
      .leftJoin(carriers, eq(orders.carrierId, carriers.id)).where(eq(orders.id, id));
    const order = row?.order;
    if (!order || (actor.role === "REPRESENTATIVE" && order.representativeId !== actor.representativeId)) throw new OrderBusinessError("ORDER_NOT_FOUND");
    return { ...order, customerName: row.customerName, customerErpCode: row.customerErpCode,
      paymentTermDescription: row.paymentTermDescription, paymentTermErpCode: row.paymentTermErpCode,
      carrierName: row.carrierName, carrierErpCode: row.carrierErpCode,
      items: await client.select().from(orderItems).where(eq(orderItems.orderId, id)) };
  }
  async list(actor: Actor, input: { page: number; pageSize: number; status?: "DRAFT" | "SUBMITTED"; number?: number; customer?: string }) {
    const filters: any[] = [];
    if (actor.role === "REPRESENTATIVE") filters.push(eq(orders.representativeId, actor.representativeId!));
    if (input.status) filters.push(eq(orders.internalStatus, input.status));
    if (input.number) filters.push(eq(orders.internalNumber, input.number));
    if (input.customer) filters.push(ilike(customers.corporateName, `%${input.customer}%`));
    const where = filters.length ? and(...filters) : undefined;
    const [items, totalResult] = await Promise.all([
      db.select({ order: orders, customerName: customers.corporateName, customerErpCode: customers.erpCode, paymentTermDescription: paymentTerms.description, paymentTermErpCode: paymentTerms.erpCode, carrierName: carriers.name, carrierErpCode: carriers.erpCode }).from(orders).innerJoin(customers, eq(orders.customerId, customers.id)).innerJoin(paymentTerms, eq(orders.paymentTermId, paymentTerms.id)).leftJoin(carriers, eq(orders.carrierId, carriers.id)).where(where).orderBy(desc(orders.createdAt)).limit(input.pageSize).offset((input.page - 1) * input.pageSize),
      db.select({ value: count() }).from(orders).innerJoin(customers, eq(orders.customerId, customers.id)).where(where),
    ]);
    const totalItems = totalResult[0]?.value ?? 0;
    return { items: items.map(({ order, ...display }) => ({ ...order, ...display })), page: input.page, pageSize: input.pageSize, totalItems, totalPages: Math.ceil(totalItems / input.pageSize) };
  }
  async update(actor: Actor, id: string, version: number, input: Partial<{ customerId: string; paymentTermId: string; carrierId: string | null; notes: string | null }> & Partial<Discounts>) {
    assertVersion(version);
    return db.transaction(async tx => {
      const order = await this.lockOwned(tx, id, actor, version);
      if (input.customerId && input.customerId !== order.customerId) {
        const itemCount = await tx.select({ value: count() }).from(orderItems).where(eq(orderItems.orderId, id));
        if ((itemCount[0]?.value ?? 0) > 0) throw new OrderBusinessError("ORDER_HAS_ITEMS");
      }
      await this.validateHeader(tx, actor, { customerId: input.customerId ?? order.customerId, paymentTermId: input.paymentTermId ?? order.paymentTermId, carrierId: input.carrierId === undefined ? order.carrierId : input.carrierId });
      const [updated] = await tx.update(orders).set({ ...input, updatedAt: new Date(), version: order.version + 1 }).where(eq(orders.id, id)).returning();
      if (["discount1", "discount2", "discount3", "discount4"].some(key => key in input)) {
        await this.recalculate(tx, updated);
        return this.detailIn(tx, actor, id);
      }
      return this.detailIn(tx, actor, id);
    });
  }
  async addItem(actor: Actor, id: string, version: number, input: { productId: string; quantity: string; specialUnitPrice?: string | null }) {
    assertVersion(version);
    return db.transaction(async tx => {
      const order = await this.lockOwned(tx, id, actor, version);
      const [product] = await tx.select().from(products).where(eq(products.id, input.productId));
      if (!product?.active) throw new OrderBusinessError("PRODUCT_NOT_AVAILABLE");
      const price = await pricingService.resolvePrice({ customerId: order.customerId, productId: input.productId });
      if (!price.found) throw new OrderBusinessError("PRICE_NOT_FOUND", "Não existe preço disponível para este produto e cliente.");
      const special = input.specialUnitPrice ? normalizeUnitPrice(input.specialUnitPrice) : null;
      assertPositive(input.quantity, "quantity");
      const discounts = discountsOf(order); const effective = special ?? price.unitPrice;
      const net = special ? effective : discountService.applyCascade(effective, discounts);
      const grossTotal = multiplyDecimal(effective, 6, input.quantity, 4, 2);
      const netTotal = multiplyDecimal(net, 6, input.quantity, 4, 2);
      assertMoneyFits(grossTotal);
      assertMoneyFits(netTotal);
      await tx.insert(orderItems).values({ orderId: id, productId: product.id, groupCode: product.groupCode, typeCode: product.typeCode, productCode: product.productCode, referenceCode: product.referenceCode, productCodeSnapshot: product.code, descriptionSnapshot: product.description, packagingSnapshot: product.packaging, widthSnapshot: product.width, colorSnapshot: product.color, quantity: input.quantity, suggestedUnitPrice: price.unitPrice, suggestedPriceOrigin: price.origin, suggestedPriceTableId: price.priceTableId, suggestedPriceTableErpCode: price.priceTableErpCode, effectiveUnitPrice: effective, effectivePriceOrigin: special ? "SPECIAL" : price.origin, isSpecialPrice: !!special, specialUnitPrice: special, discount1: discounts[0], discount2: discounts[1], discount3: discounts[2], discount4: discounts[3], discountsApplied: !special, netUnitPrice: net, grossTotal, netTotal });
      await this.recalculate(tx, order); return this.detailIn(tx, actor, id);
    });
  }
  async updateItem(actor: Actor, id: string, itemId: string, version: number, input: { quantity?: string; specialUnitPrice?: string | null }) {
    assertVersion(version);
    return db.transaction(async tx => { const order = await this.lockOwned(tx, id, actor, version); const [item] = await tx.select().from(orderItems).where(and(eq(orderItems.id, itemId), eq(orderItems.orderId, id))); if (!item) throw new OrderBusinessError("ITEM_NOT_FOUND");
      const special = input.specialUnitPrice === undefined ? item.specialUnitPrice : input.specialUnitPrice === null ? null : normalizeUnitPrice(input.specialUnitPrice);
      if (input.quantity !== undefined) assertPositive(input.quantity, "quantity");
      await tx.update(orderItems).set({ quantity: input.quantity ?? item.quantity, isSpecialPrice: !!special, specialUnitPrice: special, updatedAt: new Date() }).where(eq(orderItems.id, itemId)); await this.recalculate(tx, order); return this.detailIn(tx, actor, id);
    });
  }
  async deleteItem(actor: Actor, id: string, itemId: string, version: number) { assertVersion(version); return db.transaction(async tx => { const order = await this.lockOwned(tx, id, actor, version); const deleted = await tx.delete(orderItems).where(and(eq(orderItems.id, itemId), eq(orderItems.orderId, id))).returning(); if (!deleted[0]) throw new OrderBusinessError("ITEM_NOT_FOUND"); await this.recalculate(tx, order); return this.detailIn(tx, actor, id); }); }
  async submit(id: string, actor: Actor, version: number) { assertVersion(version); return db.transaction(async tx => { const order = await this.lockOwned(tx, id, actor, version); const [representative] = await tx.select().from(representatives).where(eq(representatives.id, order.representativeId)); await this.validateHeader(tx, actor, order); const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, id)); if (!representative?.active || !items.length) throw new OrderBusinessError("ORDER_NOT_READY"); await this.recalculate(tx, order); await tx.update(orders).set({ internalStatus: "SUBMITTED", submittedAt: new Date(), updatedAt: new Date(), version: order.version + 2 }).where(eq(orders.id, id)); return this.detailIn(tx, actor, id); }); }
}
export const orderService = new DbOrderService();
export interface OrderService { submit(orderId: string, actorUserId: string): Promise<void>; }