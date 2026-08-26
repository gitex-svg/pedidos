import assert from "node:assert/strict";
import test from "node:test";
import { loadConfig } from "./config";

const valid = {
  DATABASE_URL: "postgres://user:password@localhost:5432/gitex",
  SESSION_SECRET: "a".repeat(32),
  ERP_API_KEY: "erp-test-key",
  NODE_ENV: "test",
};

test("configuration validates required values without exposing secret values", () => {
  const env = { ...valid, SESSION_SECRET: "short-secret-value" };
  assert.throws(() => loadConfig(env, { requirePort: false }), (error: Error) =>
    error.message.includes("SESSION_SECRET") && !error.message.includes(env.SESSION_SECRET));
});

test("production requires an exact Better Auth origin", () => {
  assert.throws(() => loadConfig({ ...valid, NODE_ENV: "production" }, { requirePort: false }), /BETTER_AUTH_URL/);
  assert.throws(() => loadConfig({ ...valid, NODE_ENV: "production", BETTER_AUTH_URL: "https://gitex.test/auth" }, { requirePort: false }), /BETTER_AUTH_URL/);
  assert.equal(loadConfig({ ...valid, NODE_ENV: "production", BETTER_AUTH_URL: "https://gitex.test" }, { requirePort: false }).betterAuthUrl, "https://gitex.test");
});