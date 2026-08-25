import type { NextFunction, Request, Response } from "express";
import { getUserFromToken, SESSION_COOKIE } from "../auth/session";
import { hasRole, type AppRole } from "../auth/policy";

declare global {
  namespace Express {
    interface Request {
      authUser?: Awaited<ReturnType<typeof getUserFromToken>>;
    }
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.[SESSION_COOKIE] as string | undefined;
  const user = await getUserFromToken(token);
  if (!user) return res.status(401).json({ error: "Não autenticado." });
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