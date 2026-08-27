import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import test, { after, before } from "node:test";
import { hashPassword } from "better-auth/crypto";
import { eq, inArray } from "drizzle-orm";
import {
  accounts,
  customers,
  db,
  orderItems,
  orders,
  paymentTerms,
  priceTableItems,
  priceTables,
  products,
  representatives,
  users,
} from "@workspace/db";
import app from "../app";

const prefix = `dashboard-${Date.now()}`;
const password = "TesteSeguro@2026";
let server: Server;
let base = "";
let representativeCookie = "";
let representativeId = "";
let customerId = "";
let paymentTermId = "";
let productId = "";
let draftOrderId = "";
let submittedOrderId = "";

const representativeEmail = `${prefix}-representative@test.local`;
const otherEmail = `${prefix}-other@test.local`;

async function createUser(email: string) {
  const [created] = await db.insert(users).values({
    name: prefix,
    email,
    role: "REPRESENTATIVE",
  }).returning();
  await db.insert(accounts).values({
    id: randomUUID(),
    issuer: "local:credential",
    accountId: created.id,
    providerId: "credential",
    userId: created.id,
    password: await hashPassword(password),
  });
  return created;
}

async function login(email: string) {
  const response = await fetch(`${base}/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  assert.equal(response.status, 200);
  return response.headers.get("set-cookie")!.split(";")[0];
}

async function request(path: string, method = "GET", body?: unknown, cookie = representativeCookie) {
  return fetch(`${base}${path}`, {
    method,
    headers: {
      cookie,
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

async function summary() {
  const response = await request("/v1/dashboard/summary");
  assert.equal(response.status, 200);
  return response.json() as Promise<{
    draft_count: number;
    submitted_count: number;
    approved_count: number;
    invoiced_count: number;
    rejected_count: number;
  }>;
}

before(async () => {
  const representative = await createUser(representativeEmail);
  const other = await createUser(otherEmail);
  const [ownRepresentative, otherRepresentative] = await db.insert(representatives).values([
    { erpCode: `${prefix}-representative`, name: prefix, userId: representative.id, sourceUpdatedAt: new Date() },
    { erpCode: `${prefix}-other`, name: prefix, userId: other.id, sourceUpdatedAt: new Date() },
  ]).returning();
  representativeId = ownRepresentative.id;

  [customerId] = (await db.insert(customers).values({
    erpCode: `${prefix}-customer`,
    representativeId,
    corporateName: prefix,
    sourceUpdatedAt: new Date(),
  }).returning({ id: customers.id })).map((row) => row.id);
  [paymentTermId] = (await db.insert(paymentTerms).values({
    erpCode: `${prefix}-payment-term`,
    description: prefix,
    sourceUpdatedAt: new Date(),
  }).returning({ id: paymentTerms.id })).map((row) => row.id);
  const [product] = await db.insert(products).values({
    erpId: `${prefix}-product`,
    code: prefix,
    description: prefix,
    groupCode: "01",
    typeCode: "02",
    productCode: "0001",
    referenceCode: "1",
    sourceUpdatedAt: new Date(),
  }).returning();
  productId = product.id;
  const [priceTable] = await db.insert(priceTables).values({
    erpCode: `${prefix}-price-table`,
    name: prefix,
    priceType: "CUSTOMER",
    customerId,
    sourceUpdatedAt: new Date(),
  }).returning();
  await db.insert(priceTableItems).values({
    priceTableId: priceTable.id,
    productId,
    unitPrice: "10.000000",
    sourceUpdatedAt: new Date(),
  });

  server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("API server did not start");
  base = `http://127.0.0.1:${address.port}/api`;
  representativeCookie = await login(representativeEmail);

  // Kept to make it explicit that the other representative's records must not
  // influence this test's dashboard.
  assert.ok(otherRepresentative.id);
});

after(async () => {
  await db.delete(orderItems).where(inArray(orderItems.orderId, db.select({ id: orders.id }).from(orders).where(eq(orders.representativeId, representativeId))));
  await db.delete(orders).where(eq(orders.representativeId, representativeId));
  await db.delete(priceTableItems).where(eq(priceTableItems.productId, productId));
  await db.delete(priceTables).where(eq(priceTables.customerId, customerId));
  await db.delete(products).where(eq(products.id, productId));
  await db.delete(customers).where(eq(customers.id, customerId));
  await db.delete(paymentTerms).where(eq(paymentTerms.id, paymentTermId));
  await db.delete(representatives).where(inArray(representatives.erpCode, [`${prefix}-representative`, `${prefix}-other`]));
  await db.delete(users).where(inArray(users.email, [representativeEmail, otherEmail]));
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

test("dashboard follows create, submit, a new draft, and ERP approval", async () => {
  assert.deepEqual(await summary(), {
    draft_count: 0,
    submitted_count: 0,
    approved_count: 0,
    invoiced_count: 0,
    rejected_count: 0,
  });

  let response = await request("/v1/orders", "POST", {
    customerId,
    paymentTermId,
    discount1: "0",
    discount2: "0",
    discount3: "0",
    discount4: "0",
  });
  assert.equal(response.status, 201);
  let order = await response.json() as { id: string; version: number };
  submittedOrderId = order.id;
  assert.equal((await summary()).draft_count, 1);

  response = await request(`/v1/orders/${order.id}/items`, "POST", {
    version: order.version,
    productId,
    quantity: "1.0000",
  });
  assert.equal(response.status, 201);
  order = await response.json() as { id: string; version: number };
  response = await request(`/v1/orders/${order.id}/submit`, "POST", { version: order.version });
  assert.equal(response.status, 200);
  assert.deepEqual(await summary(), {
    draft_count: 0,
    submitted_count: 1,
    approved_count: 0,
    invoiced_count: 0,
    rejected_count: 0,
  });

  response = await request("/v1/orders", "POST", {
    customerId,
    paymentTermId,
    discount1: "0",
    discount2: "0",
    discount3: "0",
    discount4: "0",
  });
  assert.equal(response.status, 201);
  draftOrderId = (await response.json() as { id: string }).id;
  assert.deepEqual(await summary(), {
    draft_count: 1,
    submitted_count: 1,
    approved_count: 0,
    invoiced_count: 0,
    rejected_count: 0,
  });

  await db.update(orders).set({
    erpStatus: "APROVADO",
    erpLastStatusAt: new Date(),
  }).where(eq(orders.id, submittedOrderId));
  assert.deepEqual(await summary(), {
    draft_count: 1,
    submitted_count: 0,
    approved_count: 1,
    invoiced_count: 0,
    rejected_count: 0,
  });
});