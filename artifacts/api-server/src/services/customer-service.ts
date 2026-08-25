import { customers, db } from "@workspace/db";
import { and, asc, count, desc, eq, ilike, or, type SQL } from "drizzle-orm";

export type CustomerListInput = {
  page: number; limit: number; search?: string; active?: boolean;
  sort: "name" | "erpCode" | "city" | "updatedAt"; order: "asc" | "desc";
  representativeId?: string;
};

export class CustomerService {
  async list(input: CustomerListInput) {
    const filters: SQL[] = [];
    if (input.representativeId) filters.push(eq(customers.representativeId, input.representativeId));
    if (input.active !== undefined) filters.push(eq(customers.active, input.active));
    if (input.search) {
      const q = `%${input.search}%`;
      filters.push(or(ilike(customers.corporateName, q), ilike(customers.tradeName, q), ilike(customers.erpCode, q), ilike(customers.cnpjCpf, q))!);
    }
    const where = filters.length ? and(...filters) : undefined;
    const columns = {
      name: customers.corporateName, erpCode: customers.erpCode,
      city: customers.city, updatedAt: customers.updatedAt,
    };
    const direction = input.order === "desc" ? desc : asc;
    const [items, totals] = await Promise.all([
      db.select().from(customers).where(where).orderBy(direction(columns[input.sort]), asc(customers.id))
        .limit(input.limit).offset((input.page - 1) * input.limit),
      db.select({ count: count() }).from(customers).where(where),
    ]);
    const total = totals[0]?.count ?? 0;
    return { items, page: input.page, limit: input.limit, total, totalPages: Math.ceil(total / input.limit) };
  }

  async findAccessibleById(customerId: string, representativeId: string) {
    const result = await db.select().from(customers)
      .where(and(eq(customers.id, customerId), eq(customers.representativeId, representativeId))).limit(1);
    return result[0] ?? null;
  }
}

export const customerService = new CustomerService();