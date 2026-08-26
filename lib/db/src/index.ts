import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export interface PoolEnvironmentConfig {
  max: number;
  idleTimeoutMillis: number;
  connectionTimeoutMillis: number;
  query_timeout: number;
  statement_timeout: number;
  ssl: false | { rejectUnauthorized: false };
}

/** Reads bounded pool settings without including environment values in errors. */
export function loadPoolEnvironmentConfig(env = process.env): PoolEnvironmentConfig {
  const sslMode = env.DB_SSL_MODE?.trim() || "disable";
  if (sslMode !== "disable" && sslMode !== "require") {
    throw new Error("Invalid configuration: DB_SSL_MODE");
  }
  return {
    max: boundedInteger(env, "DB_POOL_MAX", 10, 1, 100),
    idleTimeoutMillis: boundedInteger(env, "DB_IDLE_TIMEOUT_MS", 30_000, 1_000, 300_000),
    connectionTimeoutMillis: boundedInteger(env, "DB_CONNECT_TIMEOUT_MS", 5_000, 100, 60_000),
    query_timeout: boundedInteger(env, "DB_QUERY_TIMEOUT_MS", 30_000, 100, 300_000),
    statement_timeout: boundedInteger(env, "DB_STATEMENT_TIMEOUT_MS", 30_000, 100, 300_000),
    ssl: sslMode === "require" ? { rejectUnauthorized: false } : false,
  };
}

function boundedInteger(
  env: NodeJS.ProcessEnv,
  name: string,
  defaultValue: number,
  minimum: number,
  maximum: number,
): number {
  const raw = env[name]?.trim();
  if (!raw) return defaultValue;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`Invalid configuration: ${name}`);
  }
  return value;
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL, ...loadPoolEnvironmentConfig() });
export const db = drizzle(pool, { schema });

export * from "./schema";
