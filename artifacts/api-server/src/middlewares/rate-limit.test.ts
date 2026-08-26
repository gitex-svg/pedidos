import assert from "node:assert/strict";
import test from "node:test";
import { BoundedRateLimiter } from "./rate-limit";

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