import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import type { Server } from "node:http";
import { hashPassword } from "better-auth/crypto";
import { eq } from "drizzle-orm";
import { db, sessions, users } from "@workspace/db";
import app from "../app";

const email = `auth-test-${Date.now()}@gitex.test`;
const password = "TesteSeguro@2026";
let baseUrl = "";
let server: Server;

before(async () => {
  const passwordHash = await hashPassword(password);
  await db.insert(users).values({ email, passwordHash, role: "REPRESENTATIVE", active: true });
  server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Servidor de teste não iniciou.");
  baseUrl = `http://127.0.0.1:${address.port}/api`;
});

after(async () => {
  const user = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (user[0]) {
    await db.delete(sessions).where(eq(sessions.userId, user[0].id));
    await db.delete(users).where(eq(users.id, user[0].id));
  }
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
});

test("rejeita senha incorreta", async () => {
  const response = await fetch(`${baseUrl}/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: "SenhaIncorreta@2026" }),
  });
  assert.equal(response.status, 401);
});

test("protege dashboard sem sessão", async () => {
  const response = await fetch(`${baseUrl}/v1/dashboard/summary`);
  assert.equal(response.status, 401);
});

test("autentica, mantém sessão e invalida no logout", async () => {
  const login = await fetch(`${baseUrl}/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.get("set-cookie")?.split(";")[0];
  assert.ok(cookie);

  const me = await fetch(`${baseUrl}/v1/auth/me`, { headers: { cookie } });
  assert.equal(me.status, 200);
  assert.equal((await me.json() as { role: string }).role, "REPRESENTATIVE");

  const dashboard = await fetch(`${baseUrl}/v1/dashboard/summary`, { headers: { cookie } });
  assert.equal(dashboard.status, 200);

  const logout = await fetch(`${baseUrl}/v1/auth/logout`, {
    method: "POST",
    headers: { cookie },
  });
  assert.equal(logout.status, 204);

  const afterLogout = await fetch(`${baseUrl}/v1/auth/me`, { headers: { cookie } });
  assert.equal(afterLogout.status, 401);
});