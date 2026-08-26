import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import test, { after, before } from "node:test";
import { hashPassword } from "better-auth/crypto";
import { eq, inArray } from "drizzle-orm";
import { accounts, carriers, customers, db, orderItems, orders, paymentTerms, priceTableItems, priceTables, products, representatives, users } from "@workspace/db";
import app from "../app";

const prefix = `f4-${Date.now()}`;
const password = "TesteSeguro@2026";
let server: Server, base = "", repCookie = "", otherCookie = "", adminCookie = "";
let repId = "", ownCustomer = "", otherCustomer = "", termId = "", carrierId = "", productId = "";
const emails = [`${prefix}-rep@test.local`, `${prefix}-other@test.local`, `${prefix}-admin@test.local`];

async function user(email: string, role: "REPRESENTATIVE" | "ADMIN") {
  const [u] = await db.insert(users).values({ name: prefix, email, role }).returning();
  await db.insert(accounts).values({ id: randomUUID(), issuer: "local:credential", accountId: u.id, providerId: "credential", userId: u.id, password: await hashPassword(password) });
  return u;
}
async function login(email: string) {
  const response = await fetch(`${base}/v1/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password }) });
  assert.equal(response.status, 200); return response.headers.get("set-cookie")!.split(";")[0];
}
async function request(path: string, cookie: string, method = "GET", body?: unknown) {
  return fetch(`${base}${path}`, { method, headers: { cookie, ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
}
const header = () => ({ customerId: ownCustomer, paymentTermId: termId, carrierId, notes: "phase 4", discount1: "10", discount2: "5", discount3: "0", discount4: "0" });

before(async () => {
  const rep = await user(emails[0], "REPRESENTATIVE"), other = await user(emails[1], "REPRESENTATIVE");
  await user(emails[2], "ADMIN");
  const [r1] = await db.insert(representatives).values({ erpCode: `${prefix}-r1`, name: prefix, userId: rep.id, sourceUpdatedAt: new Date() }).returning();
  const [r2] = await db.insert(representatives).values({ erpCode: `${prefix}-r2`, name: prefix, userId: other.id, sourceUpdatedAt: new Date() }).returning();
  repId = r1.id;
  [ownCustomer, otherCustomer] = (await db.insert(customers).values([
    { erpCode: `${prefix}-c1`, representativeId: r1.id, corporateName: "Own customer", sourceUpdatedAt: new Date() },
    { erpCode: `${prefix}-c2`, representativeId: r2.id, corporateName: "Other customer", sourceUpdatedAt: new Date() },
  ]).returning()).map(x => x.id);
  [termId] = (await db.insert(paymentTerms).values({ erpCode: `${prefix}-term`, description: "30 days", sourceUpdatedAt: new Date() }).returning({ id: paymentTerms.id })).map(x => x.id);
  [carrierId] = (await db.insert(carriers).values({ erpCode: `${prefix}-carrier`, name: "Carrier", sourceUpdatedAt: new Date() }).returning({ id: carriers.id })).map(x => x.id);
  const [p] = await db.insert(products).values({ erpId: `${prefix}-product`, groupCode: "01", typeCode: "02", productCode: "0001", referenceCode: "00000001", code: "F4P", description: "Frozen product", packaging: "roll", width: "10", color: "blue", sourceUpdatedAt: new Date() }).returning();
  productId = p.id;
  const [table] = await db.insert(priceTables).values({ erpCode: `${prefix}-table`, name: "Customer", priceType: "CUSTOMER", customerId: ownCustomer, sourceUpdatedAt: new Date() }).returning();
  await db.insert(priceTableItems).values({ priceTableId: table.id, productId, unitPrice: "2.994300", sourceUpdatedAt: new Date() });
  server = app.listen(0); await new Promise<void>(resolve => server.once("listening", resolve));
  const address = server.address(); if (!address || typeof address === "string") throw new Error("no server"); base = `http://127.0.0.1:${address.port}/api`;
  [repCookie, otherCookie, adminCookie] = await Promise.all(emails.map(login));
});

after(async () => {
  await db.delete(orderItems).where(inArray(orderItems.orderId, db.select({ id: orders.id }).from(orders).where(eq(orders.representativeId, repId))));
  await db.delete(orders).where(eq(orders.representativeId, repId));
  await db.delete(priceTableItems).where(eq(priceTableItems.productId, productId));
  await db.delete(priceTables).where(eq(priceTables.customerId, ownCustomer));
  await db.delete(products).where(eq(products.id, productId));
  await db.delete(customers).where(inArray(customers.id, [ownCustomer, otherCustomer]));
  await db.delete(paymentTerms).where(eq(paymentTerms.id, termId)); await db.delete(carriers).where(eq(carriers.id, carrierId));
  await db.delete(representatives).where(eq(representatives.id, repId));
  await db.delete(users).where(inArray(users.email, emails));
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
});

test("orders HTTP lifecycle: isolation, snapshots, precision, special rules and immutability", async () => {
  let response = await request("/v1/orders", repCookie, "POST", { ...header(), representativeId: randomUUID(), grossTotal: "999.99", internalStatus: "SUBMITTED" });
  assert.equal(response.status, 400, "server-owned fields are rejected");
  response = await request("/v1/orders", repCookie, "POST", { ...header(), customerId: otherCustomer }); assert.equal(response.status, 400);
  response = await request("/v1/orders", repCookie, "POST", header()); assert.equal(response.status, 201);
  let order: any = await response.json(); assert.equal(order.representativeId, repId); assert.equal(order.grossTotal, "0.00");
  const id = order.id;
  assert.equal((await request(`/v1/orders/${id}`, otherCookie)).status, 404);
  assert.equal((await request(`/v1/orders/${id}`, adminCookie)).status, 200);
  assert.equal((await request(`/v1/orders/${id}`, adminCookie, "PATCH", { version: order.version, notes: "no" })).status, 403);
  response = await request(`/v1/orders/${id}/items`, repCookie, "POST", { version: order.version, productId, quantity: "3.0000" }); assert.equal(response.status, 201);
  order = await response.json(); const normal = order.items[0]; assert.equal(normal.suggestedUnitPrice, "2.994300"); assert.equal(normal.netTotal, "7.68"); assert.equal(order.netTotal, "7.68");
  response = await request(`/v1/orders/${id}/items`, repCookie, "POST", { version: order.version, productId, quantity: "3.0000", specialUnitPrice: "1.667000" }); assert.equal(response.status, 201);
  order = await response.json(); const special = order.items.find((x: any) => x.isSpecialPrice); assert.equal(special.suggestedUnitPrice, "2.994300"); assert.equal(special.netTotal, "5.00"); assert.equal(order.netTotal, "12.68");
  response = await request(`/v1/orders/${id}`, repCookie, "PATCH", { version: order.version, discount1: "20" }); assert.equal(response.status, 200);
  order = await response.json(); assert.equal(order.items.find((x: any) => x.id === special.id).netUnitPrice, "1.667000"); assert.notEqual(order.items.find((x: any) => x.id === normal.id).netUnitPrice, normal.netUnitPrice);
  response = await request(`/v1/orders/${id}/items/${special.id}`, repCookie, "PATCH", { version: order.version, specialUnitPrice: null, quantity: "3.0000" }); assert.equal(response.status, 200);
  order = await response.json(); assert.equal(order.items.find((x: any) => x.id === special.id).isSpecialPrice, false);
  assert.equal((await request(`/v1/orders/${id}/items/${special.id}`, repCookie, "DELETE", { version: order.version, grossTotal: "0.00" })).status, 400);
  assert.equal((await request(`/v1/orders/${id}`, repCookie, "PATCH", { version: order.version, customerId: otherCustomer })).status, 409);
  assert.equal((await request(`/v1/orders/${id}`, repCookie, "PATCH", { version: order.version - 1, notes: "stale" })).status, 409);
  await db.update(products).set({ description: "Changed" }).where(eq(products.id, productId));
  assert.equal((await request(`/v1/orders/${id}`, repCookie)).status, 200); order = await (await request(`/v1/orders/${id}`, repCookie)).json(); assert.equal(order.items[0].descriptionSnapshot, "Frozen product");
  assert.equal((await request(`/v1/orders/${id}/submit`, repCookie, "POST", { version: order.version, internalStatus: "SUBMITTED" })).status, 400);
  response = await request(`/v1/orders/${id}/submit`, repCookie, "POST", { version: order.version }); assert.equal(response.status, 200);
  order = await response.json(); assert.equal(order.internalStatus, "SUBMITTED");
  assert.equal((await request(`/v1/orders/${id}/items`, repCookie, "POST", { version: order.version, productId, quantity: "1.0000" })).status, 409);
  assert.equal((await request(`/v1/orders/${id}`, repCookie, "PATCH", { version: order.version, notes: "blocked" })).status, 409);
});

test("empty submit is blocked and concurrent same-version writes have one winner", async () => {
  let response = await request("/v1/orders", repCookie, "POST", header());
  assert.equal(response.status, 201);
  let order: any = await response.json();
  assert.equal((await request(`/v1/orders/${order.id}/submit`, repCookie, "POST", { version: order.version })).status, 409);
  const [left, right] = await Promise.all([
    request(`/v1/orders/${order.id}`, repCookie, "PATCH", { version: order.version, notes: "left" }),
    request(`/v1/orders/${order.id}`, repCookie, "PATCH", { version: order.version, notes: "right" }),
  ]);
  assert.deepEqual([left.status, right.status].sort(), [200, 409]);
  response = await request(`/v1/orders/${order.id}`, repCookie);
  assert.equal(response.status, 200); order = await response.json();
  assert.ok(["left", "right"].includes(order.notes));
  assert.equal(order.grossTotal, "0.00"); assert.equal(order.netTotal, "0.00");
});

test("numeric boundaries normalize leading-zero prices and reject total overflow as a business error", async () => {
  let response = await request("/v1/orders", repCookie, "POST", header());
  assert.equal(response.status, 201);
  let order: any = await response.json();

  response = await request(`/v1/orders/${order.id}/items`, repCookie, "POST", {
    version: order.version,
    productId,
    quantity: "1.0000",
    specialUnitPrice: "000000000003.25",
  });
  assert.equal(response.status, 201);
  order = await response.json();
  assert.equal(order.items[0].specialUnitPrice, "3.250000");

  response = await request(`/v1/orders/${order.id}/items`, repCookie, "POST", {
    version: order.version,
    productId,
    quantity: "99999999999999.9999",
    specialUnitPrice: "999999999999.999999",
  });
  assert.equal(response.status, 400);
  const overflowError: any = await response.json();
  assert.equal(overflowError.code, "TOTAL_OUT_OF_RANGE");

  response = await request(`/v1/orders/${order.id}`, repCookie);
  assert.equal(response.status, 200);
  const unchanged: any = await response.json();
  assert.equal(unchanged.version, order.version);
  assert.equal(unchanged.items.length, 1);
});