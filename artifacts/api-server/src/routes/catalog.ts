import { Router, type IRouter, type Response } from "express";
import { carriers, db, paymentTerms } from "@workspace/db";
import { and, asc, count, desc, eq, ilike, type SQL } from "drizzle-orm";
import { z } from "zod";
import { getAuthenticatedRepresentative } from "../auth/representative";
import { requireAuth } from "../middlewares/auth";
import { customerService } from "../services/customer-service";
import { productService } from "../services/product-service";

const router: IRouter = Router();
const snake = (value: unknown): unknown => {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(snake);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(
      ([key, item]) => [key.replace(/[A-Z]/g, c => `_${c.toLowerCase()}`), snake(item)],
    ));
  }
  return value;
};
const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(200).optional(), q: z.string().trim().max(200).optional(),
  active: z.enum(["true", "false"]).transform(v => v === "true").optional(),
  sort: z.string().optional(), order: z.enum(["asc", "desc"]).default("asc"),
  group_code: z.string().max(2).optional(), type_code: z.string().max(2).optional(),
  product_code: z.string().max(4).optional(), reference_code: z.string().max(8).optional(),
  code: z.string().max(64).optional(), description: z.string().max(200).optional(),
  collection: z.string().max(120).optional(), packaging: z.string().max(120).optional(),
  width: z.string().max(64).optional(), color: z.string().max(120).optional(),
});

function invalid(res: Response, error: z.ZodError) {
  return res.status(400).json({ error: "Parâmetros inválidos.", details: z.treeifyError(error) });
}

router.get("/v1/customers", requireAuth, async (req, res) => {
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) return invalid(res, parsed.error);
  const user = req.authUser!;
  const representative = await getAuthenticatedRepresentative(user);
  if (user.role === "REPRESENTATIVE" && !representative) return res.status(403).json({ error: "Representante não vinculado ou inativo." });
  const sorts = ["name", "erpCode", "city", "updatedAt"] as const;
  const sort = sorts.includes(parsed.data.sort as typeof sorts[number]) ? parsed.data.sort as typeof sorts[number] : "name";
  return res.json(snake(await customerService.list({
    ...parsed.data, search: parsed.data.q ?? parsed.data.search, sort, active: user.role === "ADMIN" ? parsed.data.active : true,
    representativeId: representative?.id,
  })));
});

router.get("/v1/products", requireAuth, async (req, res) => {
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) return invalid(res, parsed.error);
  const sorts = ["description", "erpId", "productCode", "updatedAt"] as const;
  const sort = sorts.includes(parsed.data.sort as typeof sorts[number]) ? parsed.data.sort as typeof sorts[number] : "description";
  return res.json(snake(await productService.list({
    page: parsed.data.page, limit: parsed.data.limit, order: parsed.data.order, sort,
    search: parsed.data.q ?? parsed.data.search, active: req.authUser!.role === "ADMIN" ? parsed.data.active : true,
    groupCode: parsed.data.group_code, typeCode: parsed.data.type_code, productCode: parsed.data.product_code,
    referenceCode: parsed.data.reference_code, code: parsed.data.code, description: parsed.data.description,
    collection: parsed.data.collection, packaging: parsed.data.packaging, width: parsed.data.width, color: parsed.data.color,
  })));
});

async function auxiliaryList(
  table: typeof paymentTerms | typeof carriers, query: unknown, isAdmin: boolean,
) {
  const parsed = querySchema.parse(query);
  const filters: SQL[] = [];
  if (!isAdmin || parsed.active !== undefined) filters.push(eq(table.active, isAdmin ? parsed.active! : true));
  if (parsed.search) filters.push(ilike("description" in table ? table.description : table.name, `%${parsed.search}%`));
  const where = filters.length ? and(...filters) : undefined;
  const sortColumn = parsed.sort === "erpCode" ? table.erpCode
    : parsed.sort === "updatedAt" ? table.updatedAt : ("description" in table ? table.description : table.name);
  const direction = parsed.order === "desc" ? desc : asc;
  const [items, totals] = await Promise.all([
    db.select().from(table).where(where).orderBy(direction(sortColumn), asc(table.id))
      .limit(parsed.limit).offset((parsed.page - 1) * parsed.limit),
    db.select({ count: count() }).from(table).where(where),
  ]);
  const total = totals[0]?.count ?? 0;
  return { items, page: parsed.page, limit: parsed.limit, total, totalPages: Math.ceil(total / parsed.limit) };
}

for (const [path, table] of [["payment-terms", paymentTerms], ["carriers", carriers]] as const) {
  router.get(`/v1/${path}`, requireAuth, async (req, res) => {
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) return invalid(res, parsed.error);
    return res.json(snake(await auxiliaryList(table, req.query, req.authUser!.role === "ADMIN")));
  });
}

export default router;