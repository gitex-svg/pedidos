import { randomUUID } from "node:crypto";
import { Router, type IRouter } from "express";
import {
  carriers, customers, db, integrationLogs, paymentTerms, priceTableItems, priceTables,
  priceTypeEnum, products, representatives,
} from "@workspace/db";
import { eq, or, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { requireErpApiKey } from "../middlewares/erp-api-key";
import { limitErp } from "../middlewares/rate-limit";
import { ErpOrderError, erpOrderService } from "../services/erp-integration-service";

const router: IRouter = Router();
router.use("/v1/erp", limitErp);
const code = z.string().trim().min(1).max(128);
const sourceUpdatedAt = z.coerce.date();
const base = { active: z.boolean().default(true), source_updated_at: sourceUpdatedAt };
const nullableDate = z.coerce.date().nullable();
const decimalPrice = z.string().regex(
  /^\d{1,12}\.\d{1,6}$/,
  "unit_price must contain 1-12 integer digits and 1-6 fractional digits",
);
export function canonicalPrice(value: string) {
  const [integer, fraction = ""] = value.split(".");
  const canonicalInteger = integer.replace(/^0+(?=\d)/, "");
  return `${canonicalInteger}.${fraction.padEnd(6, "0")}`;
}
const priceTableSchema = z.object({
  erp_code: code,
  name: z.string().trim().min(1).max(200),
  price_type: z.enum(priceTypeEnum.enumValues),
  representative_erp_code: code.optional(),
  customer_erp_code: code.optional(),
  valid_from: nullableDate,
  valid_until: nullableDate,
  ...base,
}).superRefine((item, context) => {
  if (item.price_type === "REPRESENTATIVE" && !item.representative_erp_code) {
    context.addIssue({ code: "custom", path: ["representative_erp_code"], message: "Required for REPRESENTATIVE price tables." });
  }
  if (item.price_type !== "REPRESENTATIVE" && item.representative_erp_code !== undefined) {
    context.addIssue({ code: "custom", path: ["representative_erp_code"], message: "Only allowed for REPRESENTATIVE price tables." });
  }
  if (item.price_type === "CUSTOMER" && !item.customer_erp_code) {
    context.addIssue({ code: "custom", path: ["customer_erp_code"], message: "Required for CUSTOMER price tables." });
  }
  if (item.price_type !== "CUSTOMER" && item.customer_erp_code !== undefined) {
    context.addIssue({ code: "custom", path: ["customer_erp_code"], message: "Only allowed for CUSTOMER price tables." });
  }
  if (item.valid_from && item.valid_until && item.valid_from > item.valid_until) {
    context.addIssue({ code: "custom", path: ["valid_until"], message: "Must not precede valid_from." });
  }
});
export const erpItemSchemas = {
  representatives: z.object({ erp_code: code, name: z.string().trim().min(1).max(200), email: z.email().nullish(), ...base }),
  customers: z.object({
    erp_code: code, representative_erp_code: code, corporate_name: z.string().trim().min(1).max(200),
    trade_name: z.string().trim().max(200).nullish(), cnpj_cpf: z.string().trim().max(32).nullish(),
    city: z.string().trim().max(120).nullish(), state: z.string().trim().length(2).nullish(), ...base,
  }),
  products: z.object({
    erp_id: code, code: z.string().trim().min(1).max(64), description: z.string().trim().min(1).max(10000),
    collection: z.string().trim().max(120).nullish(), packaging: z.string().trim().max(120).nullish(),
    width: z.string().trim().max(64).nullish(), color: z.string().trim().max(120).nullish(),
    group_code: z.string().length(2), type_code: z.string().length(2), product_code: z.string().length(4), reference_code: z.string().min(1).max(8), ...base,
  }),
  "payment-terms": z.object({
    erp_code: code, description: z.string().trim().min(1).max(240),
    installments: z.number().int().positive().nullish(), ...base,
  }),
  carriers: z.object({
    erp_code: code, name: z.string().trim().min(1).max(200),
    tax_id: z.string().trim().max(32).nullish(), ...base,
  }),
  "price-tables": priceTableSchema,
  "price-table-items": z.object({
    price_table_erp_code: code,
    product_erp_id: code,
    unit_price: decimalPrice,
    ...base,
  }),
} as const;

type Counters = { received: number; created: number; updated: number; ignored: number; errors: number };
type Outcome = "created" | "updated" | "ignored";
type Result = { index: number; external_id?: string; status: Outcome | "error"; reason?: string; message?: string };
class RepresentativeNotFoundError extends Error {}
class PriceTableNotFoundError extends Error {}
class ProductNotFoundError extends Error {}
class CustomerNotFoundError extends Error {}

export function isStale(current: Date | null, incoming: Date) {
  return current !== null && incoming.getTime() <= current.getTime();
}

const handlers: Record<keyof typeof erpItemSchemas, (item: any) => Promise<Outcome>> = {
  representatives: async item => {
    const values = {
      name: item.name, email: item.email ?? null, active: item.active,
      sourceUpdatedAt: item.source_updated_at, lastSyncedAt: new Date(), updatedAt: new Date(),
      // userId is deliberately omitted: ERP synchronization must never unlink a login.
    };
    const [result] = await db.insert(representatives).values({ erpCode: item.erp_code, ...values })
      .onConflictDoUpdate({
        target: representatives.erpCode, set: values,
        setWhere: or(isNull(representatives.sourceUpdatedAt), sql`${representatives.sourceUpdatedAt} < excluded.source_updated_at`),
      }).returning({ created: sql<boolean>`xmax = 0` });
    return !result ? "ignored" : result.created ? "created" : "updated";
  },
  customers: async item => {
    const [representative] = await db.select({ id: representatives.id }).from(representatives)
      .where(eq(representatives.erpCode, item.representative_erp_code)).limit(1);
    if (!representative) throw new RepresentativeNotFoundError();
    const values = {
      representativeId: representative.id, corporateName: item.corporate_name, tradeName: item.trade_name ?? null,
      cnpjCpf: item.cnpj_cpf ?? null, city: item.city ?? null, state: item.state?.toUpperCase() ?? null,
      active: item.active, sourceUpdatedAt: item.source_updated_at, lastSyncedAt: new Date(), updatedAt: new Date(),
    };
    const [result] = await db.insert(customers).values({ erpCode: item.erp_code, ...values })
      .onConflictDoUpdate({
        target: customers.erpCode, set: values,
        setWhere: sql`${customers.sourceUpdatedAt} < excluded.source_updated_at`,
      }).returning({ created: sql<boolean>`xmax = 0` });
    return !result ? "ignored" : result.created ? "created" : "updated";
  },
  products: async item => {
    const values = {
      groupCode: item.group_code, typeCode: item.type_code, productCode: item.product_code,
      referenceCode: item.reference_code, code: item.code, description: item.description,
      collection: item.collection ?? null, packaging: item.packaging ?? null, width: item.width ?? null, color: item.color ?? null, active: item.active, sourceUpdatedAt: item.source_updated_at,
      lastSyncedAt: new Date(), updatedAt: new Date(),
    };
    const [result] = await db.insert(products).values({ erpId: item.erp_id, ...values })
      .onConflictDoUpdate({
        target: products.erpId, set: values,
        setWhere: sql`${products.sourceUpdatedAt} < excluded.source_updated_at`,
      }).returning({ created: sql<boolean>`xmax = 0` });
    return !result ? "ignored" : result.created ? "created" : "updated";
  },
  "payment-terms": async item => {
    const values = {
      description: item.description, installments: item.installments ?? null, active: item.active,
      sourceUpdatedAt: item.source_updated_at, lastSyncedAt: new Date(), updatedAt: new Date(),
    };
    const [result] = await db.insert(paymentTerms).values({ erpCode: item.erp_code, ...values })
      .onConflictDoUpdate({
        target: paymentTerms.erpCode, set: values,
        setWhere: sql`${paymentTerms.sourceUpdatedAt} < excluded.source_updated_at`,
      }).returning({ created: sql<boolean>`xmax = 0` });
    return !result ? "ignored" : result.created ? "created" : "updated";
  },
  carriers: async item => {
    const values = {
      name: item.name, taxId: item.tax_id ?? null, active: item.active,
      sourceUpdatedAt: item.source_updated_at, lastSyncedAt: new Date(), updatedAt: new Date(),
    };
    const [result] = await db.insert(carriers).values({ erpCode: item.erp_code, ...values })
      .onConflictDoUpdate({
        target: carriers.erpCode, set: values,
        setWhere: sql`${carriers.sourceUpdatedAt} < excluded.source_updated_at`,
      }).returning({ created: sql<boolean>`xmax = 0` });
    return !result ? "ignored" : result.created ? "created" : "updated";
  },
  "price-tables": async item => {
    let representativeId: string | null = null;
    let customerId: string | null = null;
    if (item.price_type === "REPRESENTATIVE") {
      const [representative] = await db.select({ id: representatives.id }).from(representatives)
        .where(eq(representatives.erpCode, item.representative_erp_code)).limit(1);
      if (!representative) throw new RepresentativeNotFoundError();
      representativeId = representative.id;
    } else if (item.price_type === "CUSTOMER") {
      const [customer] = await db.select({ id: customers.id }).from(customers)
        .where(eq(customers.erpCode, item.customer_erp_code)).limit(1);
      if (!customer) throw new CustomerNotFoundError();
      customerId = customer.id;
    }
    const values = {
      name: item.name, priceType: item.price_type, representativeId, customerId,
      validFrom: item.valid_from, validUntil: item.valid_until, active: item.active,
      sourceUpdatedAt: item.source_updated_at, lastSyncedAt: new Date(), updatedAt: new Date(),
    };
    const [result] = await db.insert(priceTables).values({ erpCode: item.erp_code, ...values })
      .onConflictDoUpdate({
        target: priceTables.erpCode, set: values,
        setWhere: sql`${priceTables.sourceUpdatedAt} < excluded.source_updated_at`,
      }).returning({ created: sql<boolean>`xmax = 0` });
    return !result ? "ignored" : result.created ? "created" : "updated";
  },
  "price-table-items": async item => {
    const [[priceTable], [product]] = await Promise.all([
      db.select({ id: priceTables.id }).from(priceTables)
        .where(eq(priceTables.erpCode, item.price_table_erp_code)).limit(1),
      db.select({ id: products.id }).from(products)
        .where(eq(products.erpId, item.product_erp_id)).limit(1),
    ]);
    if (!priceTable) throw new PriceTableNotFoundError();
    if (!product) throw new ProductNotFoundError();
    const values = {
      unitPrice: canonicalPrice(item.unit_price), active: item.active,
      sourceUpdatedAt: item.source_updated_at, lastSyncedAt: new Date(), updatedAt: new Date(),
    };
    const [result] = await db.insert(priceTableItems)
      .values({ priceTableId: priceTable.id, productId: product.id, ...values })
      .onConflictDoUpdate({
        target: [priceTableItems.priceTableId, priceTableItems.productId], set: values,
        setWhere: sql`${priceTableItems.sourceUpdatedAt} < excluded.source_updated_at`,
      }).returning({ created: sql<boolean>`xmax = 0` });
    return !result ? "ignored" : result.created ? "created" : "updated";
  },
};

export const erpBatchSchema = z.object({
  correlation_id: z.uuid().optional(),
  items: z.array(z.unknown()).max(500),
});

const orderIdSchema = z.uuid();
const correlationIdSchema = z.uuid().optional();
const erpOrderStatusSchema = z.enum(["EM_ANALISE", "APROVADO", "FECHADO", "FATURADO", "REPROVADO"]);
const erpOrderNumberSchema = z.string().trim().min(1).max(128);
const submittedQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
}).strict();
const confirmSchema = z.object({
  erp_order_number: erpOrderNumberSchema,
  erp_import_id: z.string().trim().min(1).max(128).optional(),
  status: erpOrderStatusSchema.optional(),
  source_updated_at: z.coerce.date(),
  correlation_id: correlationIdSchema,
}).strict();
const statusSchema = z.object({
  status: erpOrderStatusSchema,
  source_updated_at: z.coerce.date(),
  correlation_id: correlationIdSchema,
}).strict();

function orderOperation(req: any, supplied?: string) {
  return {
    correlationId: supplied ?? randomUUID(),
    endpoint: req.path,
    method: req.method,
  };
}

async function orderFailure(res: any, error: unknown, operation: ReturnType<typeof orderOperation>, id?: string) {
  if (!(error instanceof ErpOrderError)) {
    const wrapped = new ErpOrderError("PERSISTENCE_ERROR");
    await erpOrderService.logFailure(operation, id, wrapped);
    res.status(500).json({ error: "Erro ao processar pedido.", code: wrapped.code, correlation_id: operation.correlationId });
    return;
  }
  await erpOrderService.logFailure(operation, id, error);
  const status = error.code === "ORDER_NOT_FOUND" ? 404
    : error.code.endsWith("_CONFLICT") ? 409
      : 409;
  res.status(status).json({ error: error.message, code: error.code, correlation_id: operation.correlationId });
}

router.get("/v1/erp/orders/submitted", requireErpApiKey, async (req, res) => {
  const parsed = submittedQuerySchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: "Parâmetros inválidos.", details: z.treeifyError(parsed.error) });
  return res.json(await erpOrderService.listSubmitted(parsed.data));
});

router.get("/v1/erp/orders/:id", requireErpApiKey, async (req, res) => {
  const id = orderIdSchema.safeParse(req.params.id);
  if (!id.success) return res.status(400).json({ error: "Identificador inválido." });
  try {
    return res.json(await erpOrderService.detail(id.data));
  } catch (error) {
    const operation = orderOperation(req);
    return orderFailure(res, error, operation, id.data);
  }
});

router.post("/v1/erp/orders/:id/confirm", requireErpApiKey, async (req, res) => {
  const id = orderIdSchema.safeParse(req.params.id);
  const body = confirmSchema.safeParse(req.body);
  if (!id.success || !body.success) return res.status(400).json({ error: "Dados inválidos." });
  const operation = orderOperation(req, body.data.correlation_id);
  try {
    return res.json(await erpOrderService.confirm(id.data, {
      erpOrderNumber: body.data.erp_order_number,
      erpImportId: body.data.erp_import_id,
      status: body.data.status,
      sourceUpdatedAt: body.data.source_updated_at,
    }, operation));
  } catch (error) {
    return orderFailure(res, error, operation, id.data);
  }
});

router.patch("/v1/erp/orders/:id/status", requireErpApiKey, async (req, res) => {
  const id = orderIdSchema.safeParse(req.params.id);
  const body = statusSchema.safeParse(req.body);
  if (!id.success || !body.success) return res.status(400).json({ error: "Dados inválidos." });
  const operation = orderOperation(req, body.data.correlation_id);
  try {
    return res.json(await erpOrderService.updateStatus(id.data, {
      status: body.data.status,
      sourceUpdatedAt: body.data.source_updated_at,
    }, operation));
  } catch (error) {
    return orderFailure(res, error, operation, id.data);
  }
});

for (const entity of Object.keys(erpItemSchemas) as (keyof typeof erpItemSchemas)[]) {
  router.post(`/v1/erp/${entity}/sync`, requireErpApiKey, async (req, res) => {
    const batch = erpBatchSchema.safeParse(req.body);
    if (!batch.success) return res.status(400).json({ error: "Lote inválido.", details: z.treeifyError(batch.error) });
    const correlationId = batch.data.correlation_id ?? randomUUID();
    const counters: Counters = { received: batch.data.items.length, created: 0, updated: 0, ignored: 0, errors: 0 };
    const errors: { index: number; external_id?: string; error: string }[] = [];
    const results: Result[] = [];
    for (const [index, raw] of batch.data.items.entries()) {
      const parsed = erpItemSchemas[entity].safeParse(raw);
      const externalId = raw && typeof raw === "object"
        ? String(("erp_id" in raw ? raw.erp_id
          : "erp_code" in raw ? raw.erp_code
            : "product_erp_id" in raw ? raw.product_erp_id : "") ?? "") : "";
      if (!parsed.success) {
        counters.errors++;
        const error = z.prettifyError(parsed.error);
        errors.push({ index, ...(externalId && { external_id: externalId }), error });
        results.push({ index, ...(externalId && { external_id: externalId }), status: "error", reason: "VALIDATION_ERROR", message: "Item inválido." });
        continue;
      }
      try {
        const outcome = await handlers[entity](parsed.data);
        counters[outcome]++;
        results.push({
          index, ...(externalId && { external_id: externalId }), status: outcome,
          ...(outcome === "ignored" && { reason: "STALE_SOURCE_VERSION" }),
        });
      } catch (error) {
        counters.errors++;
        const knownError = error instanceof RepresentativeNotFoundError
          ? { reason: "REPRESENTATIVE_NOT_FOUND", message: "Representante ERP não encontrado." }
          : error instanceof PriceTableNotFoundError
            ? { reason: "PRICE_TABLE_NOT_FOUND", message: "Tabela de preço ERP não encontrada." }
            : error instanceof ProductNotFoundError
              ? { reason: "PRODUCT_NOT_FOUND", message: "Produto ERP não encontrado." }
              : error instanceof CustomerNotFoundError
                ? { reason: "CUSTOMER_NOT_FOUND", message: "Cliente ERP não encontrado." }
                : { reason: "PERSISTENCE_ERROR", message: "Erro ao persistir item." };
        errors.push({
          index, ...(externalId && { external_id: externalId }),
          error: knownError.message,
        });
        results.push({
          index, ...(externalId && { external_id: externalId }), status: "error",
          reason: knownError.reason,
          message: knownError.message,
        });
      }
    }
    await db.insert(integrationLogs).values({
      correlationId, entity, endpoint: req.path, method: req.method,
      status: counters.errors ? "ERROR" : "SUCCESS", errorMessage: counters.errors ? "Batch completed with item errors." : null,
      ...counters, errorDetails: errors.length ? errors : null,
    });
    return res.status(counters.errors ? 207 : 200).json({
      correlation_id: correlationId, ...counters, item_errors: errors, results,
    });
  });
}

export default router;