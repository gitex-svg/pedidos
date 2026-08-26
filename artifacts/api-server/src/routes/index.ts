import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import dashboardRouter from "./dashboard";
import adminRouter from "./admin";
import catalogRouter from "./catalog";
import erpRouter from "./erp";
import pricingRouter from "./pricing";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(dashboardRouter);
router.use(adminRouter);
router.use(catalogRouter);
router.use(erpRouter);
router.use(pricingRouter);

export default router;
