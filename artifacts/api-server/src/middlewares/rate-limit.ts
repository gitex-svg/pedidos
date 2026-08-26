import type { NextFunction, Request, Response } from "express";

interface Entry { count: number; resetAt: number; }

export class BoundedRateLimiter {
  private readonly entries = new Map<string, Entry>();
  constructor(private readonly limit: number, private readonly windowMs: number, private readonly maxEntries = 10_000) {}

  check(key: string, now = Date.now()): number | null {
    for (const [candidate, entry] of this.entries) if (entry.resetAt <= now) this.entries.delete(candidate);
    if (this.entries.size >= this.maxEntries && !this.entries.has(key)) this.entries.delete(this.entries.keys().next().value);
    const entry = this.entries.get(key);
    if (!entry || entry.resetAt <= now) {
      this.entries.set(key, { count: 1, resetAt: now + this.windowMs });
      return null;
    }
    entry.count++;
    return entry.count > this.limit ? Math.max(1, Math.ceil((entry.resetAt - now) / 1000)) : null;
  }

  clear(): void {
    this.entries.clear();
  }
}

function clientIp(req: Request) { return req.ip || req.socket.remoteAddress || "unknown"; }
export const loginLimiter = new BoundedRateLimiter(5, 15 * 60_000);
export const erpLimiter = new BoundedRateLimiter(120, 60_000);

export function rateLimit(limiter: BoundedRateLimiter, key: (req: Request) => string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const retryAfter = limiter.check(key(req));
    if (retryAfter === null) { next(); return; }
    res.set("Retry-After", String(retryAfter));
    req.log.warn({ retryAfter }, "Rate limit exceeded");
    res.status(429).json({ error: "Muitas requisições. Tente novamente mais tarde.", requestId: req.id });
  };
}
export const limitLogin = rateLimit(loginLimiter, clientIp);
export const limitErp = rateLimit(erpLimiter, (req) => req.get("authorization") ?? clientIp(req));