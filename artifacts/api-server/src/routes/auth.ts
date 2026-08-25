import { Router, type IRouter } from "express";
import { z } from "zod";
import { db, users } from "@workspace/db";
import { eq } from "drizzle-orm";
import { auth } from "../auth/better-auth";
import { publicUser } from "../auth/format";
import { requireAuth, requireTrustedOrigin } from "../middlewares/auth";
import { getAuthenticatedRepresentative } from "../auth/representative";
import { forwardAuthCookies, toWebHeaders } from "../auth/http";

const router: IRouter = Router();
const loginSchema = z.object({ email: z.string().email(), password: z.string().min(8) });

router.post("/v1/auth/login", requireTrustedOrigin, async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Informe um e-mail e uma senha válidos." });
  const existing = await db.select().from(users).where(eq(users.email, parsed.data.email.toLowerCase())).limit(1);
  if (!existing[0]?.active) return res.status(401).json({ error: "E-mail ou senha inválidos." });

  const response = await auth.api.signInEmail({
    body: { email: parsed.data.email.toLowerCase(), password: parsed.data.password },
    headers: toWebHeaders(req),
    asResponse: true,
  });
  if (!response.ok) return res.status(401).json({ error: "E-mail ou senha inválidos." });
  forwardAuthCookies(response, res);

  await db.update(users).set({ lastLoginAt: new Date(), updatedAt: new Date() }).where(eq(users.id, existing[0].id));
  const representative = await getAuthenticatedRepresentative(existing[0]);
  return res.json({ user: publicUser(existing[0], representative?.id ?? null) });
});

router.post("/v1/auth/logout", requireTrustedOrigin, async (req, res) => {
  const response = await auth.api.signOut({ headers: toWebHeaders(req), asResponse: true });
  forwardAuthCookies(response, res);
  return res.status(204).send();
});

router.get("/v1/auth/me", requireAuth, async (req, res) => {
  const user = req.authUser!;
  const representative = await getAuthenticatedRepresentative(user);
  return res.json(publicUser(user, representative?.id ?? null));
});

export default router;