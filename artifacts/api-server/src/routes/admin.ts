import { Router, type IRouter } from "express";
import { requireAuth, requireRole } from "../middlewares/auth";

const router: IRouter = Router();

router.get("/v1/admin/health", requireAuth, requireRole("ADMIN"), (_req, res) => {
  return res.json({ status: "ok" });
});

export default router;