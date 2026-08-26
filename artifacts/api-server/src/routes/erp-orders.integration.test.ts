import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import test, { after, before } from "node:test";
import { and, eq } from "drizzle-orm";
import {
  carriers,
  customers,
  db,
  integrationLogs,
  orderItems,
  orders,
  orderStatusHistory,
  paymentTerms,
  products,
  representatives,
  users,
} from "@workspace/db";
import app from "../app";

const prefix = `f5-${Date.now()}`;
const apiKey = `${prefix}-secret`;
let server: Server;
let base = "";
let orderId = "";
let draftId = "";
let ids: Record<string, string> = {};

async function erp(path: string, method = "GET", body?: unknown, key = apiKey) {
  return fetch(`${base}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${key}`,
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

before(async () => {
  process.env.ERP_API_KEY = apiKey;
  const [user] = await db.insert(users).values({
    name: prefix,
    email: `${prefix}@test.local`,
    role: "REPRESENTATIVE",
  }).returning();
  const [representative] = await db.insert(representatives).values({
    erpCode: `${prefix}-rep`,
    name: prefix,
    userId: user.id,
    sourceUpdatedAt: new Date(),
  }).returning();
  const [customer] = await db.insert(customers).values({
    erpCode: `${prefix}-customer`,
    representativeId: representative.id,
    corporateName: prefix,
    sourceUpdatedAt: new Date(),
  }).returning();
  const [term] = await db.insert(paymentTerms).values({
    erpCode: `${prefix}-term`,
    description: prefix,
    sourceUpdatedAt: new Date(),
  }).returning();
  const [carrier] = await db.insert(carriers).values({
    erpCode: `${prefix}-carrier`,
    name: prefix,
    sourceUpdatedAt: new Date(),
  }).returning();
  const [product] = await db.insert(products).values({
    erpId: `${prefix}-product`,
    groupCode: "01",
    typeCode: "02",
    productCode: "0001",
    referenceCode: "00000001",
    code: "SNAPSHOT",
    description: "Frozen",
    sourceUpdatedAt: new Date(),
  }).returning();
  const submittedAt = new Date("2026-08-26T10:00:00.000Z");
  const created = await db.insert(orders).values([
    {
      representativeId: representative.id,
      customerId: customer.id,
      paymentTermId: term.id,
      carrierId: carrier.id,
      representativeErpCodeSnapshot: representative.erpCode,
      customerErpCodeSnapshot: customer.erpCode,
      paymentTermErpCodeSnapshot: term.erpCode,
      carrierErpCodeSnapshot: carrier.erpCode,
      createdByUserId: user.id,
      internalStatus: "SUBMITTED",
      submittedAt,
      grossTotal: "8.98",
      netTotal: "8.98",
    },
    {
      representativeId: representative.id,
      customerId: customer.id,
      paymentTermId: term.id,
      createdByUserId: user.id,
      internalStatus: "DRAFT",
    },
  ]).returning();
  [orderId, draftId] = created.map(value => value.id);
  await db.insert(orderItems).values({
    orderId,
    productId: product.id,
    productErpIdSnapshot: product.erpId,
    groupCode: "01",
    typeCode: "02",
    productCode: "0001",
    referenceCode: "00000001",
    productCodeSnapshot: "SNAPSHOT",
    descriptionSnapshot: "Frozen",
    quantity: "3.0000",
    suggestedUnitPrice: "2.994300",
    suggestedPriceOrigin: "STANDARD",
    effectiveUnitPrice: "2.994300",
    effectivePriceOrigin: "STANDARD",
    discount1: "0",
    discount2: "0",
    discount3: "0",
    discount4: "0",
    discountsApplied: true,
    netUnitPrice: "2.994300",
    grossTotal: "8.98",
    netTotal: "8.98",
  });
  ids = { user: user.id, representative: representative.id, customer: customer.id, term: term.id, carrier: carrier.id, product: product.id };
  server = app.listen(0);
  await new Promise<void>(resolve => server.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("server unavailable");
  base = `http://127.0.0.1:${address.port}/api`;
});

after(async () => {
  await db.delete(integrationLogs).where(eq(integrationLogs.entity, "orders"));
  await db.delete(orderStatusHistory).where(eq(orderStatusHistory.orderId, orderId));
  await db.delete(orderItems).where(eq(orderItems.orderId, orderId));
  await db.delete(orders).where(eq(orders.representativeId, ids.representative));
  await db.delete(products).where(eq(products.id, ids.product));
  await db.delete(customers).where(eq(customers.id, ids.customer));
  await db.delete(paymentTerms).where(eq(paymentTerms.id, ids.term));
  await db.delete(carriers).where(eq(carriers.id, ids.carrier));
  await db.delete(representatives).where(eq(representatives.id, ids.representative));
  await db.delete(users).where(eq(users.id, ids.user));
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
});

test("ERP order HTTP contract is secure, frozen, idempotent and versioned", async () => {
  assert.equal((await fetch(`${base}/v1/erp/orders/submitted`)).status, 401);
  assert.equal((await erp("/v1/erp/orders/submitted", "GET", undefined, "wrong")).status, 401);

  let response = await erp("/v1/erp/orders/submitted?page=1&pageSize=1");
  assert.equal(response.status, 200);
  let payload: any = await response.json();
  assert.equal(payload.items.length, 1);
  assert.equal(payload.items[0].id, orderId);
  assert.equal(payload.page_size, 1);
  assert.ok(!payload.items.some((item: any) => item.id === draftId));

  response = await erp(`/v1/erp/orders/${orderId}`);
  payload = await response.json();
  assert.equal(payload.items[0].product_erp_id, `${prefix}-product`);
  assert.equal(payload.items[0].suggested_unit_price, "2.994300");
  assert.equal(payload.gross_total, "8.98");
  assert.equal(payload.representative_erp_code, `${prefix}-rep`);
  assert.equal(payload.customer_erp_code, `${prefix}-customer`);
  assert.equal(payload.payment_term_erp_code, `${prefix}-term`);
  assert.equal(payload.carrier_erp_code, `${prefix}-carrier`);

  await Promise.all([
    db.update(representatives).set({ erpCode: `${prefix}-rep-new` }).where(eq(representatives.id, ids.representative)),
    db.update(customers).set({ erpCode: `${prefix}-customer-new` }).where(eq(customers.id, ids.customer)),
    db.update(paymentTerms).set({ erpCode: `${prefix}-term-new` }).where(eq(paymentTerms.id, ids.term)),
    db.update(carriers).set({ erpCode: `${prefix}-carrier-new` }).where(eq(carriers.id, ids.carrier)),
    db.update(products).set({ erpId: `${prefix}-product-new` }).where(eq(products.id, ids.product)),
  ]);
  payload = await (await erp(`/v1/erp/orders/${orderId}`)).json();
  assert.equal(payload.representative_erp_code, `${prefix}-rep`);
  assert.equal(payload.customer_erp_code, `${prefix}-customer`);
  assert.equal(payload.payment_term_erp_code, `${prefix}-term`);
  assert.equal(payload.carrier_erp_code, `${prefix}-carrier`);
  assert.equal(payload.items[0].product_erp_id, `${prefix}-product`);
  payload = await (await erp("/v1/erp/orders/submitted")).json();
  assert.equal(payload.items.find((item: any) => item.id === orderId).representative_erp_code, `${prefix}-rep`);

  const correlation = randomUUID();
  const confirmation = {
    erp_order_number: `${prefix}-100`,
    erp_import_id: `${prefix}-import`,
    status: "EM_ANALISE",
    source_updated_at: "2026-08-26T12:00:00.000Z",
    correlation_id: correlation,
  };
  // A queue payload is only advisory: confirm must lock and re-read the current row.
  const queuedBeforeConfirm = await (await erp("/v1/erp/orders/submitted")).json() as any;
  assert.ok(queuedBeforeConfirm.items.some((item: any) => item.id === orderId));
  await db.update(orders).set({ notes: "changed after queue read" }).where(eq(orders.id, orderId));
  assert.equal((await erp(`/v1/erp/orders/${orderId}/confirm`, "POST", confirmation)).status, 200);
  const [rereadConfirmed] = await db.select().from(orders).where(eq(orders.id, orderId));
  assert.equal(rereadConfirmed.notes, "changed after queue read");
  response = await erp(`/v1/erp/orders/${orderId}/confirm`, "POST", confirmation);
  assert.equal(response.status, 200);
  assert.equal((await response.json() as any).result, "ignored");
  assert.equal((await erp(`/v1/erp/orders/${orderId}/confirm`, "POST", {
    ...confirmation,
    erp_order_number: `${prefix}-different`,
  })).status, 409);
  assert.equal((await erp(`/v1/erp/orders/${orderId}/confirm`, "POST", {
    ...confirmation,
    erp_import_id: `${prefix}-different-import`,
  })).status, 409);
  assert.equal((await erp("/v1/erp/orders/submitted")).status, 200);
  assert.ok(!(await (await erp("/v1/erp/orders/submitted")).json() as any).items.some((item: any) => item.id === orderId));

  assert.equal((await erp(`/v1/erp/orders/${orderId}/status`, "PATCH", {
    status: "INVALID",
    source_updated_at: "2026-08-26T13:00:00.000Z",
  })).status, 400);
  for (const [status, at] of [
    ["APROVADO", "2026-08-26T13:00:00.000Z"],
    ["FECHADO", "2026-08-26T14:00:00.000Z"],
    ["FATURADO", "2026-08-26T15:00:00.000Z"],
    ["REPROVADO", "2026-08-26T16:00:00.000Z"],
  ] as const) {
    response = await erp(`/v1/erp/orders/${orderId}/status`, "PATCH", {
      status, source_updated_at: at,
    });
    assert.equal((await response.json() as any).result, "updated");
  }
  response = await erp(`/v1/erp/orders/${orderId}/status`, "PATCH", {
    status: "APROVADO", source_updated_at: "2026-08-26T15:30:00.000Z",
  });
  assert.equal((await response.json() as any).reason, "STALE_SOURCE_VERSION");
  response = await erp(`/v1/erp/orders/${orderId}/status`, "PATCH", {
    status: "REPROVADO", source_updated_at: "2026-08-26T17:00:00.000Z",
  });
  assert.equal((await response.json() as any).reason, "STATUS_UNCHANGED");
  response = await erp(`/v1/erp/orders/${orderId}/status`, "PATCH", {
    status: "APROVADO", source_updated_at: "2026-08-26T17:00:00.000Z",
  });
  assert.equal((await response.json() as any).reason, "STALE_SOURCE_VERSION");

  const history = await db.select().from(orderStatusHistory).where(eq(orderStatusHistory.orderId, orderId));
  assert.deepEqual(history.map(value => value.newStatus), ["EM_ANALISE", "APROVADO", "FECHADO", "FATURADO", "REPROVADO"]);
  const [stored] = await db.select().from(orders).where(eq(orders.id, orderId));
  assert.equal(stored.erpStatus, "REPROVADO");
  assert.equal(stored.grossTotal, "8.98");
  const logs = await db.select().from(integrationLogs).where(and(
    eq(integrationLogs.entity, "orders"),
    eq(integrationLogs.entityId, orderId),
  ));
  assert.ok(logs.some(value => value.correlationId === correlation && value.status === "SUCCESS"));
  assert.ok(logs.some(value => value.errorMessage === "STALE_SOURCE_VERSION" && value.ignored === 1));
});