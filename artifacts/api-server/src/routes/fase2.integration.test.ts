import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import type { Server } from "node:http";
import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { and, eq, inArray, like } from "drizzle-orm";
import { accounts, carriers, customers, db, paymentTerms, products, representatives, users } from "@workspace/db";
import app from "../app";

const stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
const prefix = `f2-${stamp}`;
const key = process.env.ERP_API_KEY!;
const password = "TesteSeguro@2026";
let server: Server, base = "", repCookie = "", adminCookie = "", repUserId = "";
const email = (role: string) => `${role.toLowerCase()}-${prefix}@gitex.test`;
const at = (day: number) => `2026-03-${String(day).padStart(2, "0")}T12:00:00Z`;

async function user(role: "ADMIN" | "REPRESENTATIVE") {
  const [created] = await db.insert(users).values({ name: "Usuário de teste", email: email(role), role, active: true }).returning({ id: users.id });
  await db.insert(accounts).values({ id: randomUUID(), issuer: "local:credential", accountId: created.id, providerId: "credential", userId: created.id, password: await hashPassword(password) });
  return created.id;
}
async function login(address: string) {
  const r = await fetch(`${base}/v1/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: address, password }) });
  assert.equal(r.status, 200);
  return r.headers.get("set-cookie")!.split(";")[0];
}
async function erp(path: string, body: unknown, token = key) {
  return fetch(`${base}/v1/erp/${path}/sync`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(body) });
}
const auth = (cookie: string) => ({ cookie });

before(async () => {
  repUserId = await user("REPRESENTATIVE");
  await user("ADMIN");
  server = app.listen(0); await new Promise<void>(r => server.once("listening", r));
  const address = server.address(); if (!address || typeof address === "string") throw new Error("server");
  base = `http://127.0.0.1:${address.port}/api`;
  repCookie = await login(email("REPRESENTATIVE")); adminCookie = await login(email("ADMIN"));
});
after(async () => {
  await db.delete(customers).where(like(customers.erpCode, `${prefix}%`));
  await db.delete(products).where(like(products.erpId, `${prefix}%`));
  await db.delete(paymentTerms).where(like(paymentTerms.erpCode, `${prefix}%`));
  await db.delete(carriers).where(like(carriers.erpCode, `${prefix}%`));
  await db.delete(representatives).where(like(representatives.erpCode, `${prefix}%`));
  await db.delete(users).where(inArray(users.email, [email("REPRESENTATIVE"), email("ADMIN")]));
  await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve()));
});

test("ERP key rejects missing and invalid credentials", async () => {
  const missing = await fetch(`${base}/v1/erp/representatives/sync`, { method: "POST", headers: { "content-type": "application/json" }, body: '{"items":[]}' });
  assert.equal(missing.status, 401);
  assert.equal((await erp("representatives", { items: [] }, "invalid")).status, 401);
});

test("ERP syncs representatives/customers idempotently and scopes customer visibility", async () => {
  const repA = `${prefix}-RA`, repB = `${prefix}-RB`;
  assert.equal((await erp("representatives", { items: [{ erp_code: repA, name: "Rep A", source_updated_at: at(1) }, { erp_code: repB, name: "Rep B", source_updated_at: at(1) }] })).status, 200);
  const [a] = await db.select().from(representatives).where(eq(representatives.erpCode, repA));
  await db.update(representatives).set({ userId: repUserId }).where(eq(representatives.id, a.id));
  await erp("representatives", { items: [{ erp_code: repA, name: "Rep A updated", source_updated_at: at(2) }] });
  const [updated] = await db.select().from(representatives).where(eq(representatives.erpCode, repA));
  assert.equal(updated.userId, repUserId);
  const customersBatch = { items: [
    { erp_code: `${prefix}-CA`, representative_erp_code: repA, corporate_name: `${prefix} Alpha Corp`, cnpj_cpf: "001", source_updated_at: at(2) },
    { erp_code: `${prefix}-CB`, representative_erp_code: repB, corporate_name: `${prefix} Beta Corp`, cnpj_cpf: "002", source_updated_at: at(2) },
  ] };
  assert.equal((await erp("customers", customersBatch)).status, 200);
  await erp("customers", customersBatch);
  assert.equal((await db.select().from(customers).where(like(customers.erpCode, `${prefix}%`))).length, 2);
  const own = await fetch(`${base}/v1/customers?q=${prefix}`, { headers: auth(repCookie) }); const ownJson = await own.json() as any;
  assert.equal(ownJson.items.length, 1); assert.equal(ownJson.items[0].erp_code, `${prefix}-CA`);
  const all = await fetch(`${base}/v1/customers?q=${prefix}`, { headers: auth(adminCookie) }); assert.equal((await all.json() as any).items.length, 2);
});

test("products support identity filters, pagination, active visibility, stale protection and partial batches", async () => {
  const item = (id: string, codes: string[], description: string, active = true, date = at(3)) => ({ erp_id: id, code: `${prefix}-${codes[2]}`, description, group_code: codes[0], type_code: codes[1], product_code: codes[2], reference_code: codes[3], collection: prefix, packaging: "Box", width: "10", color: "Red", active, source_updated_at: date });
  const first = item(`${prefix}-P001`, ["01", "02", "0001", "00000001"], `${prefix} Zero product`);
  const second = item(`${prefix}-P002`, ["01", "03", "0002", "00000002"], `${prefix} Other product`, false);
  let response = await erp("products", { items: [first, second, { erp_id: "", source_updated_at: at(3) }] }); assert.equal(response.status, 207); assert.equal((await response.json() as any).errors, 1);
  await erp("products", { items: [first, second] });
  assert.equal((await db.select().from(products).where(like(products.erpId, `${prefix}%`))).length, 2);
  const [stored] = await db.select().from(products).where(eq(products.erpId, first.erp_id)); assert.equal(stored.productCode, "0001");
  for (const query of [`collection=${prefix}&group_code=01`, `collection=${prefix}&group_code=01&type_code=02`, `collection=${prefix}&group_code=01&type_code=02&product_code=0001`, `collection=${prefix}&group_code=01&type_code=02&product_code=0001&reference_code=00000001`, `q=${prefix}%20Zero`, `description=${prefix}%20Zero`]) {
    const r = await fetch(`${base}/v1/products?${query}`, { headers: auth(repCookie) }); assert.equal((await r.json() as any).items.length, 1);
  }
  const page = await fetch(`${base}/v1/products?collection=${prefix}&limit=1&page=1`, { headers: auth(repCookie) }); const pageJson = await page.json() as any; assert.equal(pageJson.total, 1); assert.equal(pageJson.total_pages, 1);
  await erp("products", { items: [item(first.erp_id, ["01", "02", "0001", "00000001"], "Older", true, at(1))] });
  const [fresh] = await db.select().from(products).where(eq(products.erpId, first.erp_id)); assert.equal(fresh.description, `${prefix} Zero product`);
  const newer = item(first.erp_id, ["01", "02", "0001", "00000001"], `${prefix} Concurrent newer`, true, at(6));
  const older = item(first.erp_id, ["01", "02", "0001", "00000001"], `${prefix} Concurrent older`, true, at(5));
  const outcomes = await Promise.all(Array.from({ length: 8 }, (_, index) => erp("products", { items: [index % 2 ? newer : older] })));
  assert.ok(outcomes.every(r => r.status === 200));
  const [raced] = await db.select().from(products).where(eq(products.erpId, first.erp_id));
  assert.equal(raced.sourceUpdatedAt.toISOString(), new Date(at(6)).toISOString());
  assert.equal(raced.description, `${prefix} Concurrent newer`);
});

test("payment terms and carriers are idempotent and representatives see active records only", async () => {
  const terms = { items: [{ erp_code: `${prefix}-T`, description: "Term", active: true, source_updated_at: at(4) }, { erp_code: `${prefix}-TI`, description: "Inactive", active: false, source_updated_at: at(4) }] };
  const carrierBatch = { items: [{ erp_code: `${prefix}-C`, name: "Carrier", active: true, source_updated_at: at(4) }, { erp_code: `${prefix}-CI`, name: "Inactive carrier", active: false, source_updated_at: at(4) }] };
  await erp("payment-terms", terms); await erp("payment-terms", terms); await erp("carriers", carrierBatch); await erp("carriers", carrierBatch);
  assert.equal((await db.select().from(paymentTerms).where(like(paymentTerms.erpCode, `${prefix}%`))).length, 2);
  assert.equal((await db.select().from(carriers).where(like(carriers.erpCode, `${prefix}%`))).length, 2);
  assert.equal((await (await fetch(`${base}/v1/payment-terms`, { headers: auth(repCookie) })).json() as any).items.filter((x: any) => x.erp_code.startsWith(prefix)).length, 1);
  assert.equal((await (await fetch(`${base}/v1/carriers`, { headers: auth(repCookie) })).json() as any).items.filter((x: any) => x.erp_code.startsWith(prefix)).length, 1);
});