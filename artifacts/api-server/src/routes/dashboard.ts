import { Router, type IRouter } from "express";
import { GetDashboardSummaryResponse } from "@workspace/api-zod";
import { getAuthenticatedRepresentative } from "../auth/representative";
import { requireAuth } from "../middlewares/auth";
import { dashboardService } from "../services/dashboard-service";

const router: IRouter = Router();

router.get("/v1/dashboard/summary", requireAuth, async (req, res): Promise<void> => {
  const user = req.authUser!;
  const representative = await getAuthenticatedRepresentative(user);
  const summary = await dashboardService.summary({
    role: user.role,
    representativeId: representative?.id,
  });

  res.json(GetDashboardSummaryResponse.parse(summary));
});

export default router;