import { Router, type IRouter } from "express";
import { customers, db } from "@workspace/db";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getAuthenticatedRepresentative } from "../auth/representative";
import { requireAuth } from "../middlewares/auth";
import {
  AmbiguousPriceError, PricingEntityNotFoundError, resolvePrice,
} from "../services/pricing-service";

const router: IRouter = Router();
const querySchema = z.object({
  customerId: z.uuid(),
  productId: z.uuid(),
  referenceDate: z.iso.datetime({ offset: true }).transform(value => new Date(value)).optional(),
});

router.get("/v1/pricing/resolve", requireAuth, async (req, res) => {
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: "Parâmetros inválidos.", details: z.treeifyError(parsed.error) });
  }

  if (req.authUser!.role === "REPRESENTATIVE") {
    const representative = await getAuthenticatedRepresentative(req.authUser!);
    if (!representative) {
      return res.status(403).json({ error: "Representante não vinculado ou inativo." });
    }
    const [customer] = await db.select({
      active: customers.active,
      representativeId: customers.representativeId,
    }).from(customers).where(eq(customers.id, parsed.data.customerId)).limit(1);
    if (!customer?.active) return res.status(404).json({ error: "Cliente não encontrado ou inativo." });
    if (customer.representativeId !== representative.id) {
      return res.status(403).json({ error: "Cliente não pertence ao representante autenticado." });
    }
  }

  try {
    const result = await resolvePrice(parsed.data);
    return res.json(result);
  } catch (error) {
    if (error instanceof PricingEntityNotFoundError) {
      return res.status(404).json({ error: `${error.entity} não encontrado ou inativo.` });
    }
    if (error instanceof AmbiguousPriceError) {
      return res.status(409).json({
        error: "Mais de uma tabela de preço é aplicável no mesmo nível.",
        scope: error.scope,
        priceTableIds: error.tableIds,
      });
    }
    throw error;
  }
});

export default router;