import { createHash, timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { loadConfig } from "../lib/config";

declare global {
  namespace Express {
    interface Request {
      /** SHA-256 fingerprint set only after a successful ERP credential check. */
      erpRateLimitKey?: string;
    }
  }
}

function digest(value: string) {
  return createHash("sha256").update(value, "utf8").digest();
}

export function requireErpApiKey(req: Request, res: Response, next: NextFunction) {
  let expected: string;
  try {
    expected = loadConfig(process.env, { requirePort: false }).erpApiKey;
  } catch {
    res.status(503).json({ error: "Integração ERP não configurada.", requestId: req.id });
    return;
  }
  const authorization = req.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(authorization);
  const supplied = match?.[1] ?? "";
  if (!timingSafeEqual(digest(supplied), digest(expected))) {
    return res.status(401).json({ error: "Credencial ERP inválida." });
  }
  req.erpRateLimitKey = digest(supplied).toString("base64url");
  return next();
}