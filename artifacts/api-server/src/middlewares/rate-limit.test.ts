import assert from "node:assert/strict";
import test from "node:test";
import { loadConfig } from "../lib/config";
import { BoundedRateLimiter, createErpLimiter, limitErp, rateLimit } from "./rate-limit";

function request(erpRateLimitKey?: string) {
  return {
    id: "request-id",
    erpRateLimitKey,
    log: { warn() {} },
  } as never;
}

function response() {
  const result = { statusCode: 200, body: undefined as unknown, headers: new Map<string, string>() };
  return {
    result,
    value: {
      set(name: string, value: string) { result.headers.set(name, value); return this; },
      status(code: number) { result.statusCode = code; return this; },
      json(body: unknown) { result.body = body; return this; },
    } as never,
  };
}

test("bounded limiter rejects excess requests and reports a retry delay", () => {
  const limiter = new BoundedRateLimiter(2, 1_000, 2);
  assert.equal(limiter.check("client", 1), null);
  assert.equal(limiter.check("client", 2), null);
  assert.equal(limiter.check("client", 3), 1);
  assert.equal(limiter.check("client", 1_001), null);
});

test("bounded limiter evicts old keys instead of growing without bound", () => {
  const limiter = new BoundedRateLimiter(1, 10_000, 2);
  limiter.check("one", 1);
  limiter.check("two", 1);
  assert.equal(limiter.check("three", 1), null);
});

test("rate-limit responses include standard capacity headers", () => {
  const limiter = new BoundedRateLimiter(2, 1_000);
  const middleware = rateLimit(limiter, () => "client");

  const first = response();
  let allowed = false;
  middleware(request(), first.value, (() => { allowed = true; }) as never);
  assert.equal(allowed, true);
  assert.equal(first.result.headers.get("RateLimit-Limit"), "2");
  assert.equal(first.result.headers.get("RateLimit-Remaining"), "1");
  assert.ok(Number(first.result.headers.get("RateLimit-Reset")) > 0);

  middleware(request(), response().value, (() => {}) as never);
  const blocked = response();
  middleware(request(), blocked.value, (() => assert.fail()) as never);
  assert.equal(blocked.result.statusCode, 429);
  assert.equal(blocked.result.headers.get("RateLimit-Remaining"), "0");
  assert.ok(Number(blocked.result.headers.get("Retry-After")) > 0);
});

test("ERP rate-limit applies only after a validated ERP credential supplies a key", () => {
  const config = loadConfig({
    DATABASE_URL: "postgres://user:password@localhost:5432/gitex",
    SESSION_SECRET: "a".repeat(32),
    ERP_API_KEY: "erp-test-key",
    ERP_RATE_LIMIT_MAX: "2",
    ERP_RATE_LIMIT_WINDOW_MS: "1000",
  }, { requirePort: false });
  const middleware = limitErp(createErpLimiter(config));

  const missingCredential = response();
  middleware(request(), missingCredential.value, (() => assert.fail()) as never);
  assert.equal(missingCredential.result.statusCode, 401);

  for (let attempt = 0; attempt < 2; attempt++) {
    const allowed = response();
    let passed = false;
    middleware(request("validated-erp-fingerprint"), allowed.value, (() => { passed = true; }) as never);
    assert.equal(passed, true);
  }

  const blocked = response();
  middleware(request("validated-erp-fingerprint"), blocked.value, (() => assert.fail()) as never);
  assert.equal(blocked.result.statusCode, 429);
});