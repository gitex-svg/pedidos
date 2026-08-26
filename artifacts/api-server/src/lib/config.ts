const logLevels = new Set(["fatal", "error", "warn", "info", "debug", "trace", "silent"]);

export interface AppConfig {
  databaseUrl: string;
  sessionSecret: string;
  betterAuthUrl?: string;
  erpApiKey: string;
  trustedOrigins: string[];
  logLevel: string;
  port?: number;
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
  const logLevel = env.LOG_LEVEL ?? "info";
  if (!logLevels.has(logLevel)) throw new Error("Invalid configuration: LOG_LEVEL");
  const trustedOrigins = [
    ...(betterAuthUrl ? [betterAuthUrl] : []),
    ...(env.REPLIT_DEV_DOMAIN ? [`https://${env.REPLIT_DEV_DOMAIN}`] : []),
  ];
  return { databaseUrl, sessionSecret, betterAuthUrl, erpApiKey, trustedOrigins, logLevel, port, production };
}

function requiredFrom(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`Missing required configuration: ${name}`);
  return value;
}
