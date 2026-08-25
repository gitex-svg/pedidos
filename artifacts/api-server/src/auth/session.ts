import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { hashPassword, verifyPassword } from "better-auth/crypto";
import { db, sessions, users, type User } from "@workspace/db";

export const SESSION_COOKIE = "gitex_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 12;

export function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function authenticate(email: string, password: string) {
  const userResult = await db.select().from(users).where(eq(users.email, email.toLowerCase())).limit(1);
  const user = userResult[0];
  if (!user || !user.active || !(await verifyPassword({ hash: user.passwordHash, password }))) {
    return null;
  }

  await db.update(users).set({ lastLoginAt: new Date(), updatedAt: new Date() }).where(eq(users.id, user.id));
  // A new login rotates the session and invalidates any previously issued token.
  await db.delete(sessions).where(eq(sessions.userId, user.id));
  const rawToken = randomBytes(32).toString("base64url");
  await db.insert(sessions).values({
    userId: user.id,
    tokenHash: hashSessionToken(rawToken),
    expiresAt: new Date(Date.now() + SESSION_TTL_MS),
  });
  return { user, token: rawToken };
}

export async function getUserFromToken(token: string | undefined): Promise<User | null> {
  if (!token) return null;
  const result = await db
    .select({ user: users })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.tokenHash, hashSessionToken(token)), gt(sessions.expiresAt, new Date())))
    .limit(1);
  const user = result[0]?.user;
  return user?.active ? user : null;
}

export async function revokeToken(token: string | undefined) {
  if (!token) return;
  await db.delete(sessions).where(eq(sessions.tokenHash, hashSessionToken(token)));
}