import { hashPassword } from "better-auth/crypto";
import { db, users } from "@workspace/db";
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

if (existing[0]) {
  await db
    .update(users)
    .set({ passwordHash, role: "ADMIN", active: true, updatedAt: new Date() })
    .where(eq(users.id, existing[0].id));
} else {
  await db.insert(users).values({ email, passwordHash, role: "ADMIN", active: true });
}

process.stdout.write(`Administrador ${email} criado ou atualizado.\n`);