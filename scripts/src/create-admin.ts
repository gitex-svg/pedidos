import { hashPassword } from "better-auth/crypto";
import { randomUUID } from "node:crypto";
import { db, accounts, users } from "@workspace/db";
import { eq } from "drizzle-orm";

const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD;

if (!email || !password || password.length < 12) {
  throw new Error(
    "Defina ADMIN_EMAIL e ADMIN_PASSWORD (mínimo de 12 caracteres) antes de executar.",
  );
}

const passwordHash = await hashPassword(password);
const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);

await db.transaction(async (tx) => {
  let userId = existing[0]?.id;
  if (userId) {
    await tx
      .update(users)
      .set({ role: "ADMIN", active: true, updatedAt: new Date() })
      .where(eq(users.id, userId));
  } else {
    const inserted = await tx
      .insert(users)
      .values({ name: "Administrador", email, role: "ADMIN", active: true })
      .returning({ id: users.id });
    userId = inserted[0].id;
  }

  const credential = await tx
    .select({ id: accounts.id })
    .from(accounts)
    .where(eq(accounts.userId, userId))
    .limit(1);

  if (credential[0]) {
    await tx
      .update(accounts)
      .set({
        issuer: "local:credential",
        accountId: userId,
        providerId: "credential",
        password: passwordHash,
        updatedAt: new Date(),
      })
      .where(eq(accounts.id, credential[0].id));
  } else {
    await tx.insert(accounts).values({
      id: randomUUID(),
      issuer: "local:credential",
      accountId: userId,
      providerId: "credential",
      userId,
      password: passwordHash,
    });
  }
});

process.stdout.write("Administrador criado ou atualizado com sucesso.\n");