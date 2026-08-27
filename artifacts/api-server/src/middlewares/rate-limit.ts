import type { NextFunction, Request, Response } from "express";

interface Entry { count: number; resetAt: number; }
export interface RateLimitState {
  retryAfter: number | null;
  remaining: number;
  resetAfter: number;
}

export class BoundedRateLimiter {
  private readonly entries = new Map<string, Entry>();
  constructor(
    public readonly limit: number,
    public readonly windowMs: number,
    private readonly maxEntries = 10_000,
  ) {}

  consume(key: string, now = Date.now()): RateLimitState {
    for (const [candidate, entry] of this.entries) if (entry.resetAt <= now) this.entries.delete(candidate);
    if (this.entries.size >= this.maxEntries && !this.entries.has(key)) this.entries.delete(this.entries.keys().next().value);
    let entry = this.entries.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 1, resetAt: now + this.windowMs };
      this.entries.set(key, entry);
    } else {
      entry.count++;
    }
    const resetAfter = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
    return {
      retryAfter: entry.count > this.limit ? resetAfter : null,
      remaining: Math.max(0, this.limit - entry.count),
      resetAfter,
    };
  }

  check(key: string, now = Date.now()): number | null {
    return this.consume(key, now).retryAfter;
  }

  clear(): void {
    this.entries.clear();
  }
}

function clientIp(req: Request) { return req.ip || req.socket.remoteAddress || "unknown"; }
export const loginLimiter = new BoundedRateLimiter(5, 15 * 60_000);

export function rateLimit(limiter: BoundedRateLimiter, key: (req: Request) => string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const state = limiter.consume(key(req));
    res.set("RateLimit-Limit", String(limiter.limit));
    res.set("RateLimit-Remaining", String(state.remaining));
    res.set("RateLimit-Reset", String(state.resetAfter));
    if (state.retryAfter === null) { next(); return; }
    res.set("Retry-After", String(state.retryAfter));
    req.log.warn({ retryAfter: state.retryAfter }, "Rate limit exceeded");
    res.status(429).json({ error: "Muitas requisições. Tente novamente mais tarde.", requestId: req.id });
  };
}
export const limitLogin = rateLimit(loginLimiter, clientIp);

/** This middleware must be registered after requireErpApiKey. */
export function limitErp(limiter: BoundedRateLimiter) {
  const applyLimit = rateLimit(limiter, (req) => req.erpRateLimitKey!);
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.erpRateLimitKey) {
      res.status(401).json({ error: "Credencial ERP inválida.", requestId: req.id });
      return;
    }
    applyLimit(req, res, next);
  };
}