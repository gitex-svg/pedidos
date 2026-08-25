import { createHash, timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

function digest(value: string) {
  return createHash("sha256").update(value, "utf8").digest();
}

export function requireErpApiKey(req: Request, res: Response, next: NextFunction) {
  const expected = process.env.ERP_API_KEY;
  if (!expected) return res.status(503).json({ error: "Integração ERP não configurada." });
  const authorization = req.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(authorization);
  const supplied = match?.[1] ?? "";
  if (!timingSafeEqual(digest(supplied), digest(expected))) {
    return res.status(401).json({ error: "Credencial ERP inválida." });
  }
  return next();
}