import { Router, type IRouter } from "express";
import { AddOrderItemBody, AddOrderItemParams, CreateOrderBody, DeleteOrderItemBody, DeleteOrderItemParams, GetOrderParams, ListOrdersQueryParams, SubmitOrderBody, SubmitOrderParams, UpdateOrderBody, UpdateOrderItemBody, UpdateOrderItemParams, UpdateOrderParams } from "@workspace/api-zod";
import { getAuthenticatedRepresentative } from "../auth/representative";
import { requireAuth } from "../middlewares/auth";
import { OrderBusinessError, orderService } from "../services/order-service";

const router: IRouter = Router();
const invalid = (res: any, error: unknown) => { res.status(400).json({ error: "Dados inválidos.", details: error }); };
const rejectUnknown = (value: unknown, allowed: readonly string[]) =>
  !value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some(key => !allowed.includes(key));
async function actor(req: any) {
  const user = req.authUser!;
  const representative = user.role === "REPRESENTATIVE" ? await getAuthenticatedRepresentative(user) : undefined;
  if (user.role === "REPRESENTATIVE" && !representative) throw new OrderBusinessError("REPRESENTATIVE_NOT_AVAILABLE");
  return { id: user.id, role: user.role, representativeId: representative?.id } as const;
}
function failure(res: any, error: unknown) {
  if (!(error instanceof OrderBusinessError)) throw error;
  const status = error.code === "ORDER_NOT_FOUND" || error.code === "ITEM_NOT_FOUND" ? 404
    : error.code === "READ_ONLY" || error.code === "REPRESENTATIVE_NOT_AVAILABLE" ? 403
      : error.code === "PRICE_NOT_FOUND" || error.code === "ORDER_SUBMITTED" || error.code === "VERSION_CONFLICT" || error.code === "ORDER_HAS_ITEMS" || error.code === "ORDER_NOT_READY" ? 409 : 400;
  res.status(status).json({ error: error.message, code: error.code });
}
router.get("/v1/orders", requireAuth, async (req, res): Promise<void> => {
  const parsed = ListOrdersQueryParams.safeParse(req.query); if (!parsed.success) { invalid(res, parsed.error.flatten()); return; }
  try { const input = parsed.data; res.json(await orderService.list(await actor(req), { page: input.page ?? 1, pageSize: Math.min(input.pageSize ?? 20, 100), status: input.status, number: input.number, customer: input.customer })); } catch (error) { failure(res, error); }
});
router.post("/v1/orders", requireAuth, async (req, res): Promise<void> => {
  if (rejectUnknown(req.body, ["customerId", "paymentTermId", "carrierId", "notes", "discount1", "discount2", "discount3", "discount4"])) { invalid(res, "Campos não permitidos."); return; }
  const parsed = CreateOrderBody.safeParse(req.body); if (!parsed.success) { invalid(res, parsed.error.flatten()); return; }
  try { res.status(201).json(await orderService.create(await actor(req), parsed.data)); } catch (error) { failure(res, error); }
});
router.get("/v1/orders/:id", requireAuth, async (req, res): Promise<void> => {
  const params = GetOrderParams.safeParse(req.params); if (!params.success) { invalid(res, params.error.flatten()); return; }
  try { res.json(await orderService.detail(await actor(req), params.data.id)); } catch (error) { failure(res, error); }
});
router.patch("/v1/orders/:id", requireAuth, async (req, res): Promise<void> => {
  if (rejectUnknown(req.body, ["version", "customerId", "paymentTermId", "carrierId", "notes", "discount1", "discount2", "discount3", "discount4"])) { invalid(res, "Campos não permitidos."); return; }
  const params = UpdateOrderParams.safeParse(req.params), body = UpdateOrderBody.safeParse(req.body); if (!params.success || !body.success) { invalid(res, !params.success ? params.error.flatten() : body.error!.flatten()); return; }
  try { const { version, ...input } = body.data; res.json(await orderService.update(await actor(req), params.data.id, version, input)); } catch (error) { failure(res, error); }
});
router.post("/v1/orders/:id/submit", requireAuth, async (req, res): Promise<void> => {
  if (rejectUnknown(req.body, ["version"])) { invalid(res, "Campos não permitidos."); return; }
  const params = SubmitOrderParams.safeParse(req.params), body = SubmitOrderBody.safeParse(req.body); if (!params.success || !body.success) { invalid(res, !params.success ? params.error.flatten() : body.error!.flatten()); return; }
  try { res.json(await orderService.submit(params.data.id, await actor(req), body.data.version)); } catch (error) { failure(res, error); }
});
router.post("/v1/orders/:id/items", requireAuth, async (req, res): Promise<void> => {
  if (rejectUnknown(req.body, ["version", "productId", "quantity", "specialUnitPrice"])) { invalid(res, "Campos não permitidos."); return; }
  const params = AddOrderItemParams.safeParse(req.params), body = AddOrderItemBody.safeParse(req.body); if (!params.success || !body.success) { invalid(res, !params.success ? params.error.flatten() : body.error!.flatten()); return; }
  try { const { version, ...input } = body.data; res.status(201).json(await orderService.addItem(await actor(req), params.data.id, version, input)); } catch (error) { failure(res, error); }
});
router.patch("/v1/orders/:id/items/:itemId", requireAuth, async (req, res): Promise<void> => {
  if (rejectUnknown(req.body, ["version", "quantity", "specialUnitPrice"])) { invalid(res, "Campos não permitidos."); return; }
  const params = UpdateOrderItemParams.safeParse(req.params), body = UpdateOrderItemBody.safeParse(req.body); if (!params.success || !body.success) { invalid(res, !params.success ? params.error.flatten() : body.error!.flatten()); return; }
  try { const { version, ...input } = body.data; res.json(await orderService.updateItem(await actor(req), params.data.id, params.data.itemId, version, input)); } catch (error) { failure(res, error); }
});
router.delete("/v1/orders/:id/items/:itemId", requireAuth, async (req, res): Promise<void> => {
  if (rejectUnknown(req.body, ["version"])) { invalid(res, "Campos não permitidos."); return; }
  const params = DeleteOrderItemParams.safeParse(req.params), body = DeleteOrderItemBody.safeParse(req.body); if (!params.success || !body.success) { invalid(res, !params.success ? params.error.flatten() : body.error!.flatten()); return; }
  try { res.json(await orderService.deleteItem(await actor(req), params.data.id, params.data.itemId, body.data.version)); } catch (error) { failure(res, error); }
});
export default router;