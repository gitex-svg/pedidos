import { Router, type IRouter, type Request } from "express";
import { getUserFromToken, SESSION_COOKIE } from "../auth/session";

const router: IRouter = Router();

router.get("/v1/dashboard/summary", async (req: Request, res) => {
  const user = await getUserFromToken(req.cookies?.[SESSION_COOKIE] as string | undefined);
  if (!user) return res.status(401).json({ error: "Não autenticado." });

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