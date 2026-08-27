import { hashPassword } from "better-auth/crypto";
import { randomUUID } from "node:crypto";
import { and, eq, ne } from "drizzle-orm";
import { accounts, db, pool, representatives, users } from "@workspace/db";

const email = process.env.REPRESENTATIVE_EMAIL?.trim().toLowerCase();
const password = process.env.REPRESENTATIVE_PASSWORD;
const erpCode = process.env.REPRESENTATIVE_ERP_CODE?.trim();
const requestedName = process.env.REPRESENTATIVE_NAME?.trim();

if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  throw new Error("Defina REPRESENTATIVE_EMAIL com um e-mail válido antes de executar.");
}
if (!password || password.length < 12) {
  throw new Error("Defina REPRESENTATIVE_PASSWORD (mínimo de 12 caracteres) antes de executar.");
}
if (!erpCode || erpCode.length > 64) {
  throw new Error("Defina REPRESENTATIVE_ERP_CODE (entre 1 e 64 caracteres) antes de executar.");
}
if (requestedName && requestedName.length > 200) {
  throw new Error("REPRESENTATIVE_NAME não pode exceder 200 caracteres.");
}

async function run(representativeEmail: string, representativePassword: string, representativeErpCode: string, name?: string) {
  const passwordHash = await hashPassword(representativePassword);

  await db.transaction(async (tx) => {
    const representative = await tx
      .select({
        id: representatives.id,
        name: representatives.name,
        userId: representatives.userId,
      })
      .from(representatives)
      .where(eq(representatives.erpCode, representativeErpCode))
      .limit(1);

    if (!representative[0]) {
      throw new Error("Representante não encontrado. Execute a sincronização ERP antes de cadastrar a senha.");
    }

    const existingUsers = await tx
      .select({ id: users.id, role: users.role })
      .from(users)
      .where(eq(users.email, representativeEmail))
      .limit(1);
    const existingUser = existingUsers[0];

    if (existingUser?.role === "ADMIN") {
      throw new Error("O e-mail informado já pertence a um ADMIN e não pode ser usado para representante.");
    }
    if (representative[0].userId && representative[0].userId !== existingUser?.id) {
      throw new Error("Este representante já está vinculado a outro usuário.");
    }

    let userId = existingUser?.id;
    if (userId) {
      const otherRepresentative = await tx
        .select({ id: representatives.id })
        .from(representatives)
        .where(and(eq(representatives.userId, userId), ne(representatives.id, representative[0].id)))
        .limit(1);
      if (otherRepresentative[0]) {
        throw new Error("O e-mail informado já está vinculado a outro representante.");
      }

      await tx
        .update(users)
        .set({ name: name || representative[0].name, role: "REPRESENTATIVE", active: true, updatedAt: new Date() })
        .where(eq(users.id, userId));
    } else {
      const inserted = await tx
        .insert(users)
        .values({
          name: name || representative[0].name,
          email: representativeEmail,
          role: "REPRESENTATIVE",
          active: true,
        })
        .returning({ id: users.id });
      userId = inserted[0].id;
    }

    const credential = await tx
      .select({ id: accounts.id })
      .from(accounts)
      .where(and(eq(accounts.userId, userId), eq(accounts.providerId, "credential")))
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
        password: passwordHash,
        userId,
      });
    }

    await tx
      .update(representatives)
      .set({ userId, updatedAt: new Date() })
      .where(eq(representatives.id, representative[0].id));
  });

  process.stdout.write("Representante criado ou atualizado com sucesso.\n");
}

try {
  await run(email, password, erpCode, requestedName);
} finally {
  await pool.end();
}