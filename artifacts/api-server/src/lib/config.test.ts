import assert from "node:assert/strict";
import test from "node:test";
import { loadConfig } from "./config";
import { loadPoolEnvironmentConfig } from "@workspace/db";

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

test("runtime networking settings are bounded and default safely", () => {
  const config = loadConfig(valid, { requirePort: false });
  assert.equal(config.host, "0.0.0.0");
  assert.equal(config.trustProxyHops, 0);
  assert.throws(() => loadConfig({ ...valid, TRUST_PROXY_HOPS: "11" }, { requirePort: false }), /TRUST_PROXY_HOPS/);
  assert.equal(loadConfig({ ...valid, TRUST_PROXY_HOPS: "1" }, { requirePort: false }).trustProxyHops, 1);
});

test("documented database pool environment names are applied", () => {
  const poolConfig = loadPoolEnvironmentConfig({
    DB_POOL_MAX: "7",
    DB_IDLE_TIMEOUT_MS: "12000",
    DB_CONNECT_TIMEOUT_MS: "3000",
    DB_QUERY_TIMEOUT_MS: "9000",
    DB_STATEMENT_TIMEOUT_MS: "8000",
    DB_SSL_MODE: "disable",
  });
  assert.equal(poolConfig.max, 7);
  assert.equal(poolConfig.idleTimeoutMillis, 12000);
  assert.equal(poolConfig.connectionTimeoutMillis, 3000);
  assert.equal(poolConfig.query_timeout, 9000);
  assert.equal(poolConfig.statement_timeout, 8000);
});