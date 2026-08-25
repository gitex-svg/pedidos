import { db, products } from "@workspace/db";
import { and, asc, count, desc, eq, ilike, or, type SQL } from "drizzle-orm";

export type ProductListInput = {
  page: number; pageSize: number; search?: string; active?: boolean;
  groupCode?: string; typeCode?: string; productCode?: string; referenceCode?: string;
  code?: string; description?: string; collection?: string; packaging?: string; width?: string; color?: string;
  sort: "description" | "erpId" | "productCode" | "updatedAt"; order: "asc" | "desc";
};

export class ProductService {
  async list(input: ProductListInput) {
    const filters: SQL[] = [];
    if (input.active !== undefined) filters.push(eq(products.active, input.active));
    if (input.groupCode) filters.push(eq(products.groupCode, input.groupCode));
    if (input.typeCode) filters.push(eq(products.typeCode, input.typeCode));
    if (input.productCode) filters.push(eq(products.productCode, input.productCode));
    if (input.referenceCode) filters.push(eq(products.referenceCode, input.referenceCode));
    for (const [column, value] of [[products.code, input.code], [products.description, input.description], [products.collection, input.collection], [products.packaging, input.packaging], [products.width, input.width], [products.color, input.color]] as const) {
      if (value) filters.push(ilike(column, `%${value}%`));
    }
    if (input.search) {
      const q = `%${input.search}%`;
      filters.push(or(ilike(products.description, q), ilike(products.code, q), ilike(products.erpId, q), ilike(products.productCode, q), ilike(products.referenceCode, q))!);
    }
    const where = filters.length ? and(...filters) : undefined;
    const columns = { description: products.description, erpId: products.erpId, productCode: products.productCode, updatedAt: products.updatedAt };
    const direction = input.order === "desc" ? desc : asc;
    const [items, totals] = await Promise.all([
      db.select().from(products).where(where).orderBy(direction(columns[input.sort]), asc(products.id))
        .limit(input.pageSize).offset((input.page - 1) * input.pageSize),
      db.select({ count: count() }).from(products).where(where),
    ]);
    const total = totals[0]?.count ?? 0;
    return { items, page: input.page, pageSize: input.pageSize, totalItems: total, totalPages: Math.ceil(total / input.pageSize) };
  }

  async findByErpIdentity(identity: { groupCode: string; typeCode: string; productCode: string; referenceCode: string }) {
    const result = await db.select().from(products).where(and(
      eq(products.groupCode, identity.groupCode), eq(products.typeCode, identity.typeCode),
      eq(products.productCode, identity.productCode), eq(products.referenceCode, identity.referenceCode),
    )).limit(1);
    return result[0] ?? null;
  }
}

export const productService = new ProductService();