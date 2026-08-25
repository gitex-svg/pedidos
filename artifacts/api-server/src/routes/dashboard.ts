import { Router, type IRouter } from "express";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

router.get("/v1/dashboard/summary", requireAuth, async (_req, res) => {
  // The order tables are intentionally introduced in Phase 2/4. Until then
  // the protected dashboard exposes a truthful empty state rather than demo data.
  return res.json({
    draft_count: 0,
    submitted_count: 0,
    approved_count: 0,
    invoiced_count: 0,
    rejected_count: 0,
  });
});

export default router;