import { Router, type IRouter, type Request } from "express";
import { z } from "zod";
import { db, representatives } from "@workspace/db";
import { eq } from "drizzle-orm";
import { authenticate, revokeToken, SESSION_COOKIE } from "../auth/session";
import { publicUser } from "../auth/format";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();
const loginSchema = z.object({ email: z.string().email(), password: z.string().min(8) });

function tokenFromRequest(req: Request) {
  return req.cookies?.[SESSION_COOKIE] as string | undefined;
}

router.post("/v1/auth/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Informe um e-mail e uma senha válidos." });
  const result = await authenticate(parsed.data.email, parsed.data.password);
  if (!result) return res.status(401).json({ error: "E-mail ou senha inválidos." });
  const representative = await db.select().from(representatives).where(eq(representatives.userId, result.user.id)).limit(1);
  res.cookie(SESSION_COOKIE, result.token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 1000 * 60 * 60 * 12,
    path: "/",
  });
  return res.json({ user: publicUser(result.user, representative[0]?.id ?? null) });
});

router.post("/v1/auth/logout", async (req, res) => {
  await revokeToken(tokenFromRequest(req));
  res.clearCookie(SESSION_COOKIE, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/" });
  return res.status(204).send();
});

router.get("/v1/auth/me", requireAuth, async (req, res) => {
  const user = req.authUser!;
  const representative = await db.select().from(representatives).where(eq(representatives.userId, user.id)).limit(1);
  return res.json(publicUser(user, representative[0]?.id ?? null));
});

export default router;