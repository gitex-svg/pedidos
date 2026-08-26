import assert from "node:assert/strict";
import test, { after, before, beforeEach } from "node:test";
import type { Server } from "node:http";
import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { inArray } from "drizzle-orm";
import { accounts, db, users } from "@workspace/db";
import app from "../app";
import { loginLimiter } from "../middlewares/rate-limit";

const password = "TesteSeguro@2026";
const emails = {
  representative: `representative-${Date.now()}@gitex.test`,
  inactive: `inactive-${Date.now()}@gitex.test`,
  admin: `admin-${Date.now()}@gitex.test`,
};
let baseUrl = "";
let server: Server;

async function createCredentialUser(email: string, role: "ADMIN" | "REPRESENTATIVE", active: boolean) {
  const inserted = await db
    .insert(users)
    .values({ name: "Usuário de teste", email, role, active })
    .returning({ id: users.id });
  await db.insert(accounts).values({
    id: randomUUID(),
    issuer: "local:credential",
    accountId: inserted[0].id,
    providerId: "credential",
    userId: inserted[0].id,
    password: await hashPassword(password),
  });
}

async function login(email: string, candidatePassword = password) {
  return fetch(`${baseUrl}/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: candidatePassword }),
  });
}

function sessionCookie(response: Response) {
  return response.headers.get("set-cookie")?.split(";")[0];
}

before(async () => {
  await createCredentialUser(emails.representative, "REPRESENTATIVE", true);
  await createCredentialUser(emails.inactive, "REPRESENTATIVE", false);
  await createCredentialUser(emails.admin, "ADMIN", true);
  server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Servidor de teste não iniciou.");
  baseUrl = `http://127.0.0.1:${address.port}/api`;
});

beforeEach(() => {
  loginLimiter.clear();
});

after(async () => {
  await db.delete(users).where(inArray(users.email, Object.values(emails)));
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
});

test("rejeita senha incorreta sem criar sessão", async () => {
  const response = await login(emails.representative, "SenhaIncorreta@2026");
  assert.equal(response.status, 401);
  assert.equal(sessionCookie(response), undefined);
});

test("limita login a cinco tentativas por IP em quinze minutos", async () => {
  for (let attempt = 1; attempt <= 5; attempt++) {
    const response = await login(emails.representative, "SenhaIncorreta@2026");
    assert.equal(response.status, 401);
  }

  const blocked = await login(emails.representative, "SenhaIncorreta@2026");
  assert.equal(blocked.status, 429);
  assert.ok(Number(blocked.headers.get("retry-after")) > 0);
});

test("usuário inativo não autentica, não recebe sessão e não acessa endpoint protegido", async () => {
  const response = await login(emails.inactive);
  assert.equal(response.status, 401);
  assert.equal(sessionCookie(response), undefined);
  const protectedResponse = await fetch(`${baseUrl}/v1/dashboard/summary`);
  assert.equal(protectedResponse.status, 401);
});

test("sessão existente deixa de autorizar quando o usuário é desativado", async () => {
  const response = await login(emails.representative);
  const cookie = sessionCookie(response);
  assert.ok(cookie);
  await db.update(users).set({ active: false }).where(inArray(users.email, [emails.representative]));
  const protectedResponse = await fetch(`${baseUrl}/v1/dashboard/summary`, { headers: { cookie } });
  assert.equal(protectedResponse.status, 401);
  await db.update(users).set({ active: true }).where(inArray(users.email, [emails.representative]));
});

test("protege dashboard sem sessão", async () => {
  const response = await fetch(`${baseUrl}/v1/dashboard/summary`);
  assert.equal(response.status, 401);
});

test("login correto permite endpoint protegido e logout invalida sessão", async () => {
  const response = await login(emails.representative);
  assert.equal(response.status, 200);
  const cookie = sessionCookie(response);
  assert.ok(cookie);

  const me = await fetch(`${baseUrl}/v1/auth/me`, { headers: { cookie } });
  assert.equal(me.status, 200);
  assert.equal((await me.json() as { role: string }).role, "REPRESENTATIVE");

  const dashboard = await fetch(`${baseUrl}/v1/dashboard/summary`, { headers: { cookie } });
  assert.equal(dashboard.status, 200);

  const logout = await fetch(`${baseUrl}/v1/auth/logout`, { method: "POST", headers: { cookie } });
  assert.equal(logout.status, 204);
  const afterLogout = await fetch(`${baseUrl}/v1/auth/me`, { headers: { cookie } });
  assert.equal(afterLogout.status, 401);
});

test("rejeita login e logout originados por host não confiável", async () => {
  const forgedLogin = await fetch(`${baseUrl}/v1/auth/login`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://projeto-malicioso.replit.dev",
    },
    body: JSON.stringify({ email: emails.representative, password }),
  });
  assert.equal(forgedLogin.status, 403);
  assert.equal(sessionCookie(forgedLogin), undefined);

  const authResponse = await login(emails.representative);
  const cookie = sessionCookie(authResponse);
  assert.ok(cookie);
  const forgedLogout = await fetch(`${baseUrl}/v1/auth/logout`, {
    method: "POST",
    headers: { cookie, origin: "https://projeto-malicioso.replit.dev" },
  });
  assert.equal(forgedLogout.status, 403);

  const stillAuthenticated = await fetch(`${baseUrl}/v1/auth/me`, { headers: { cookie } });
  assert.equal(stillAuthenticated.status, 200);
});

test("rota ADMIN responde 401 sem autenticação", async () => {
  const response = await fetch(`${baseUrl}/v1/admin/health`);
  assert.equal(response.status, 401);
});

test("rota ADMIN responde 403 para REPRESENTATIVE", async () => {
  const authResponse = await login(emails.representative);
  const cookie = sessionCookie(authResponse);
  assert.ok(cookie);
  const response = await fetch(`${baseUrl}/v1/admin/health`, { headers: { cookie } });
  assert.equal(response.status, 403);
});

test("rota ADMIN responde 200 para ADMIN", async () => {
  const authResponse = await login(emails.admin);
  const cookie = sessionCookie(authResponse);
  assert.ok(cookie);
  const response = await fetch(`${baseUrl}/v1/admin/health`, { headers: { cookie } });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "ok" });
});