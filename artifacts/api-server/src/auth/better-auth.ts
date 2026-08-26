import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { db, account, session, user, verification } from "@workspace/db";
import { loadConfig } from "../lib/config";

const config = loadConfig(process.env, { requirePort: false });
const production = config.production;
const secret = config.sessionSecret;
const configuredBaseUrl = config.betterAuthUrl;
const replitDevHost = process.env.REPLIT_DEV_DOMAIN;

const localOrigins = ["http://localhost:*", "http://127.0.0.1:*"];
const trustedOrigins = [
  ...localOrigins,
  ...(replitDevHost ? [`https://${replitDevHost}`] : []),
  ...config.trustedOrigins,
];

export const auth = betterAuth({
  secret,
  baseURL: configuredBaseUrl ?? {
    allowedHosts: [
      "localhost",
      "localhost:*",
      "127.0.0.1",
      "127.0.0.1:*",
      ...(replitDevHost ? [replitDevHost] : []),
    ],
  },
  trustedOrigins,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: { user, session, account, verification },
  }),
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    minPasswordLength: 12,
  },
  session: {
    expiresIn: 60 * 60 * 12,
    updateAge: 60 * 60,
  },
  rateLimit: {
    enabled: true,
    window: 60,
    max: 30,
  },
  user: {
    additionalFields: {
      role: { type: "string", required: true, defaultValue: "REPRESENTATIVE", input: false },
      active: { type: "boolean", required: true, defaultValue: true, input: false },
      lastLoginAt: { type: "date", required: false, input: false },
    },
  },
  advanced: {
    database: { generateId: "uuid" },
    cookiePrefix: "gitex",
    useSecureCookies: production,
    defaultCookieAttributes: {
      httpOnly: true,
      sameSite: "lax",
      secure: production,
      path: "/",
    },
  },
});