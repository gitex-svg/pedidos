import { randomUUID } from "node:crypto";
import { Router, type IRouter } from "express";
import { carriers, customers, db, integrationLogs, paymentTerms, products, representatives } from "@workspace/db";
import { eq, or, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { requireErpApiKey } from "../middlewares/erp-api-key";

const router: IRouter = Router();
const code = z.string().trim().min(1).max(128);
const sourceUpdatedAt = z.coerce.date();
const base = { active: z.boolean().default(true), source_updated_at: sourceUpdatedAt };
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
    group_code: z.string().length(2), type_code: z.string().length(2), product_code: z.string().length(4), reference_code: z.string().length(8), ...base,
  }),
  "payment-terms": z.object({
    erp_code: code, description: z.string().trim().min(1).max(240),
    installments: z.number().int().positive().nullish(), ...base,
  }),
  carriers: z.object({
    erp_code: code, name: z.string().trim().min(1).max(200),
    tax_id: z.string().trim().max(32).nullish(), ...base,
  }),
} as const;

type Counters = { received: number; created: number; updated: number; ignored: number; errors: number };
type Outcome = "created" | "updated" | "ignored";
type Result = { index: number; external_id?: string; status: Outcome | "error"; reason?: string; message?: string };
class RepresentativeNotFoundError extends Error {}

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
};

export const erpBatchSchema = z.object({
  correlation_id: z.uuid().optional(),
  items: z.array(z.unknown()).max(500),
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
        ? String(("erp_id" in raw ? raw.erp_id : "erp_code" in raw ? raw.erp_code : "") ?? "") : "";
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
        const missingRepresentative = error instanceof RepresentativeNotFoundError;
        const message = missingRepresentative ? "Representante ERP não encontrado." : "Erro ao persistir item.";
        errors.push({
          index, ...(externalId && { external_id: externalId }),
          error: message,
        });
        results.push({
          index, ...(externalId && { external_id: externalId }), status: "error",
          reason: missingRepresentative ? "REPRESENTATIVE_NOT_FOUND" : "PERSISTENCE_ERROR",
          message,
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