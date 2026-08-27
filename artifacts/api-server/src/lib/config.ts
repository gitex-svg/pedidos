const logLevels = new Set(["fatal", "error", "warn", "info", "debug", "trace", "silent"]);

export interface AppConfig {
  databaseUrl: string;
  sessionSecret: string;
  betterAuthUrl?: string;
  erpApiKey: string;
  trustedOrigins: string[];
  logLevel: string;
  port?: number;
  host: string;
  trustProxyHops: number;
  staticDir: string;
  readinessTimeoutMs: number;
  erpRateLimitMax: number;
  erpRateLimitWindowMs: number;
  production: boolean;
}

/** Validates configuration without ever including values in error messages. */
export function loadConfig(
  env = process.env,
  options: { requirePort?: boolean } = {},
): AppConfig {
  const databaseUrl = requiredFrom(env, "DATABASE_URL");
  try { new URL(databaseUrl); } catch { throw new Error("Invalid configuration: DATABASE_URL"); }
  const sessionSecret = requiredFrom(env, "SESSION_SECRET");
  if (sessionSecret.length < 32) throw new Error("Invalid configuration: SESSION_SECRET must be at least 32 characters");
  const erpApiKey = requiredFrom(env, "ERP_API_KEY");
  const production = env.NODE_ENV === "production";
  const rawBaseUrl = env.BETTER_AUTH_URL?.trim();
  if (production && !rawBaseUrl) throw new Error("Missing required configuration: BETTER_AUTH_URL");
  let betterAuthUrl: string | undefined;
  if (rawBaseUrl) {
    try {
      const url = new URL(rawBaseUrl);
      if (url.pathname !== "/" || url.search || url.hash) throw new Error();
      betterAuthUrl = url.origin;
    } catch { throw new Error("Invalid configuration: BETTER_AUTH_URL must be an origin"); }
  }
  const rawPort = env.PORT?.trim();
  if (options.requirePort !== false && !rawPort) throw new Error("Missing required configuration: PORT");
  let port: number | undefined;
  if (rawPort) {
    port = Number(rawPort);
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid configuration: PORT");
  }
  const host = env.HOST?.trim() || "0.0.0.0";
  const trustProxyHops = nonNegativeInteger(env, "TRUST_PROXY_HOPS", 0, 10);
  const staticDir = env.STATIC_DIR?.trim() || "public";
  const readinessTimeoutMs = positiveInteger(env, "READINESS_TIMEOUT_MS", 2_000, 100, 10_000);
  const erpRateLimitMax = positiveInteger(env, "ERP_RATE_LIMIT_MAX", 5_000, 1, 100_000);
  const erpRateLimitWindowMs = positiveInteger(env, "ERP_RATE_LIMIT_WINDOW_MS", 60_000, 1_000, 3_600_000);
  const logLevel = env.LOG_LEVEL ?? "info";
  if (!logLevels.has(logLevel)) throw new Error("Invalid configuration: LOG_LEVEL");
  const trustedOrigins = [
    ...(betterAuthUrl ? [betterAuthUrl] : []),
    ...(env.REPLIT_DEV_DOMAIN ? [`https://${env.REPLIT_DEV_DOMAIN}`] : []),
  ];
  return {
    databaseUrl, sessionSecret, betterAuthUrl, erpApiKey, trustedOrigins, logLevel,
    port, host, trustProxyHops, staticDir, readinessTimeoutMs, erpRateLimitMax, erpRateLimitWindowMs, production,
  };
}

function requiredFrom(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`Missing required configuration: ${name}`);
  return value;
}

function nonNegativeInteger(env: NodeJS.ProcessEnv, name: string, defaultValue: number, maximum: number): number {
  const raw = env[name]?.trim();
  if (!raw) return defaultValue;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0 || value > maximum) throw new Error(`Invalid configuration: ${name}`);
  return value;
}

function positiveInteger(
  env: NodeJS.ProcessEnv,
  name: string,
  defaultValue: number,
  minimum: number,
  maximum: number,
): number {
  const raw = env[name]?.trim();
  if (!raw) return defaultValue;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < minimum || value > maximum) throw new Error(`Invalid configuration: ${name}`);
  return value;
}
