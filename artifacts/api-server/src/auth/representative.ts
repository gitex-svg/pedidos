import { db, representatives, type User } from "@workspace/db";
import { and, eq } from "drizzle-orm";

export async function getAuthenticatedRepresentative(user: Pick<User, "id" | "role">) {
  if (user.role !== "REPRESENTATIVE") return null;
  const result = await db
    .select()
    .from(representatives)
    .where(and(eq(representatives.userId, user.id), eq(representatives.active, true)))
    .limit(1);
  return result[0] ?? null;
}