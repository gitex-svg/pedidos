import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { db, account, session, user, verification } from "@workspace/db";

const production = process.env.NODE_ENV === "production";
const secret = process.env.SESSION_SECRET;
const configuredBaseUrl = process.env.BETTER_AUTH_URL;
const replitDevHost = process.env.REPLIT_DEV_DOMAIN;

if (!secret || secret.length < 32) {
  throw new Error("SESSION_SECRET deve existir e possuir pelo menos 32 caracteres.");
}
if (production && !configuredBaseUrl) {
  throw new Error("BETTER_AUTH_URL deve apontar para a origem pública exata em produção.");
}

const localOrigins = ["http://localhost:*", "http://127.0.0.1:*"];
const trustedOrigins = [
  ...localOrigins,
  ...(replitDevHost ? [`https://${replitDevHost}`] : []),
  ...(configuredBaseUrl ? [new URL(configuredBaseUrl).origin] : []),
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