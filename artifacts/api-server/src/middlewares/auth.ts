import type { NextFunction, Request, Response } from "express";
import { auth } from "../auth/better-auth";
import type { User } from "@workspace/db";
import { hasRole, type AppRole } from "../auth/policy";
import { toWebHeaders } from "../auth/http";
import { loadConfig } from "../lib/config";

const config = loadConfig(process.env, { requirePort: false });

declare global {
  namespace Express {
    interface Request {
      authUser?: User;
    }
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const session = await auth.api.getSession({ headers: toWebHeaders(req) });
  const user = session?.user as User | undefined;
  if (!user?.active) return res.status(401).json({ error: "Não autenticado." });
  req.authUser = user;
  return next();
}

export function requireRole(...roles: AppRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.authUser) return res.status(401).json({ error: "Não autenticado." });
    if (!hasRole(req.authUser.role, roles)) {
      return res.status(403).json({ error: "Você não possui permissão para esta operação." });
    }
    return next();
  };
}

export function requireTrustedOrigin(req: Request, res: Response, next: NextFunction) {
  const origin = req.get("origin");
  if (!origin) {
    // Local automated clients and non-browser development tooling do not send
    // Origin. Production cookie mutations must always supply a trusted origin.
    if (!config.production) {
      next();
      return;
    }
    res.status(403).json({ error: "Origem da requisição não permitida.", requestId: req.id });
    return;
  }

  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    return res.status(403).json({ error: "Origem da requisição não permitida.", requestId: req.id });
  }

  const exactOrigins = config.trustedOrigins;
  const isExact = exactOrigins.includes(parsed.origin);
  const isLocalDevelopment =
    !config.production &&
    parsed.protocol === "http:" &&
    (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1");

  if (!isExact && !isLocalDevelopment) {
    return res.status(403).json({ error: "Origem da requisição não permitida.", requestId: req.id });
  }
  return next();
}