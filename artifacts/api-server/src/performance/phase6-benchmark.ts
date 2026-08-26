/**
 * Phase 6 local homologation benchmark.
 *
 * This program deliberately starts its own HTTP server on 127.0.0.1 and
 * creates a uniquely-prefixed fixture. It never accepts a target URL.
 */
import { performance } from "node:perf_hooks";
import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import { hashPassword } from "better-auth/crypto";
import { eq, inArray } from "drizzle-orm";
import {
  accounts, carriers, customers, db, integrationLogs, orderItems, orders,
  paymentTerms, pool, priceTableItems, priceTables, products, representatives, users,
} from "@workspace/db";
import app from "../app";

if (process.env.NODE_ENV === "production") {
  throw new Error("Phase 6 benchmark refuses to run when NODE_ENV=production.");
}
if (process.env.PERF_ALLOW_LOCAL !== "1") {
  throw new Error("Set PERF_ALLOW_LOCAL=1 to acknowledge creation and cleanup of local benchmark data.");
}

const iterations = Number.parseInt(process.env.PERF_ITERATIONS ?? "10", 10);
if (!Number.isSafeInteger(iterations) || iterations < 1 || iterations > 100) {
  throw new Error("PERF_ITERATIONS must be an integer from 1 through 100.");
}

const prefix = `phase6-perf-${Date.now()}-${randomUUID().slice(0, 8)}`;
const password = "Phase6LocalOnly@2026";
const apiKey = `${prefix}-erp-key`;
const email = `${prefix}@test.local`;
let server: Server | undefined;
let base = "";
let representativeId = "";
let customerId = "";
let paymentTermId = "";
let carrierId = "";
let productId = "";
let priceTableId = "";
type Sample = { milliseconds: number; ok: boolean };
const samples = new Map<string, Sample[]>();

function record(name: string, started: number, ok: boolean) {
  const entries = samples.get(name) ?? [];
  entries.push({ milliseconds: performance.now() - started, ok });
  samples.set(name, entries);
}

async function request(name: string, path: string, options: RequestInit, expected: number) {
  const started = performance.now();
  try {
    const response = await fetch(`${base}${path}`, options);
    const ok = response.status === expected;
    if (!ok) throw new Error(`${name}: expected HTTP ${expected}, received ${response.status}`);
    record(name, started, true);
    return response;
  } catch (error) {
    record(name, started, false);
    throw error;
  }
}

function percentile(values: number[], p: number) {
  const position = Math.ceil(values.length * p) - 1;
  return values[Math.max(0, Math.min(values.length - 1, position))]!;
}

function results() {
  return Object.fromEntries([...samples.entries()].map(([name, entries]) => {
    const values = entries.map(entry => entry.milliseconds).sort((a, b) => a - b);
    const failures = entries.filter(entry => !entry.ok).length;
    const totalSeconds = values.reduce((sum, value) => sum + value, 0) / 1000;
    return [name, {
      requests: entries.length,
      p50_ms: Number(percentile(values, 0.5).toFixed(3)),
      p95_ms: Number(percentile(values, 0.95).toFixed(3)),
      throughput_requests_per_second: Number((entries.length / totalSeconds).toFixed(3)),
      error_rate: Number((failures / entries.length).toFixed(6)),
    }];
  }));
}

async function seed() {
  process.env.ERP_API_KEY = apiKey;
  const [user] = await db.insert(users).values({ name: prefix, email, role: "REPRESENTATIVE" }).returning();
  await db.insert(accounts).values({
    id: randomUUID(), issuer: "local:credential", accountId: user.id, providerId: "credential",
    userId: user.id, password: await hashPassword(password),
  });
  const [representative] = await db.insert(representatives).values({
    erpCode: `${prefix}-rep`, name: "Phase 6 representative", userId: user.id, sourceUpdatedAt: new Date(),
  }).returning();
  representativeId = representative.id;
  const [customer] = await db.insert(customers).values({
    erpCode: `${prefix}-customer`, representativeId, corporateName: "Phase 6 customer search",
    tradeName: "Phase 6", sourceUpdatedAt: new Date(),
  }).returning();
  customerId = customer.id;
  const [term] = await db.insert(paymentTerms).values({
    erpCode: `${prefix}-term`, description: "30 days", sourceUpdatedAt: new Date(),
  }).returning();
  paymentTermId = term.id;
  const [carrier] = await db.insert(carriers).values({
    erpCode: `${prefix}-carrier`, name: "Phase 6 carrier", sourceUpdatedAt: new Date(),
  }).returning();
  carrierId = carrier.id;
  const [product] = await db.insert(products).values({
    erpId: `${prefix}-product`, groupCode: "01", typeCode: "02", productCode: "0001",
    referenceCode: "00000001", code: "P6", description: "Phase 6 product search", sourceUpdatedAt: new Date(),
  }).returning();
  productId = product.id;
  const [table] = await db.insert(priceTables).values({
    erpCode: `${prefix}-prices`, name: "Phase 6 customer prices", priceType: "CUSTOMER",
    customerId, sourceUpdatedAt: new Date(),
  }).returning();
  priceTableId = table.id;
  await db.insert(priceTableItems).values({
    priceTableId, productId, unitPrice: "2.994300", sourceUpdatedAt: new Date(),
  });
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server!.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Local benchmark server did not bind a TCP port.");
  base = `http://127.0.0.1:${address.port}/api`;
}

async function cleanup() {
  const orderIdQuery = db.select({ id: orders.id }).from(orders).where(eq(orders.representativeId, representativeId));
  await db.delete(integrationLogs).where(inArray(integrationLogs.entityId, orderIdQuery));
  await db.delete(orderItems).where(inArray(orderItems.orderId, orderIdQuery));
  await db.delete(orders).where(eq(orders.representativeId, representativeId));
  if (priceTableId) await db.delete(priceTableItems).where(eq(priceTableItems.priceTableId, priceTableId));
  if (priceTableId) await db.delete(priceTables).where(eq(priceTables.id, priceTableId));
  if (productId) await db.delete(products).where(eq(products.id, productId));
  if (customerId) await db.delete(customers).where(eq(customers.id, customerId));
  if (paymentTermId) await db.delete(paymentTerms).where(eq(paymentTerms.id, paymentTermId));
  if (carrierId) await db.delete(carriers).where(eq(carriers.id, carrierId));
  if (representativeId) await db.delete(representatives).where(eq(representatives.id, representativeId));
  await db.delete(users).where(eq(users.email, email));
  if (server) await new Promise<void>((resolve, reject) => server!.close(error => error ? reject(error) : resolve()));
  await pool.end();
}

async function main() {
  await seed();
  for (let index = 0; index < iterations; index++) {
    const login = await request("login", "/v1/auth/login", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    }, 200);
    const cookie = login.headers.get("set-cookie")!.split(";")[0];
    const authenticated = { headers: { cookie } };
    await request("customer_search", "/v1/customers?search=Phase%206&pageSize=20", authenticated, 200);
    await request("product_search", "/v1/products?search=Phase%206&pageSize=20", authenticated, 200);
    await request("pricing_resolve", `/v1/pricing/resolve?customerId=${customerId}&productId=${productId}`, authenticated, 200);
    const create = await request("order_create", "/v1/orders", {
      method: "POST", headers: { ...authenticated.headers, "content-type": "application/json" },
      body: JSON.stringify({ customerId, paymentTermId, carrierId, discount1: "0", discount2: "0", discount3: "0", discount4: "0" }),
    }, 201);
    let order: any = await create.json();
    const item = await request("order_add_item", `/v1/orders/${order.id}/items`, {
      method: "POST", headers: { ...authenticated.headers, "content-type": "application/json" },
      body: JSON.stringify({ version: order.version, productId, quantity: "3.0000" }),
    }, 201);
    order = await item.json();
    await request("order_submit", `/v1/orders/${order.id}/submit`, {
      method: "POST", headers: { ...authenticated.headers, "content-type": "application/json" },
      body: JSON.stringify({ version: order.version }),
    }, 200);
  }
  await request("erp_queue", "/v1/erp/orders/submitted?page=1&pageSize=100", {
    headers: { authorization: `Bearer ${apiKey}` },
  }, 200);
  const plans = await Promise.all([
    pool.query("EXPLAIN (FORMAT JSON) SELECT id FROM customers WHERE representative_id = $1 AND active = true ORDER BY corporate_name, id LIMIT 20", [representativeId]),
    pool.query("EXPLAIN (FORMAT JSON) SELECT id FROM orders WHERE internal_status = 'SUBMITTED' AND erp_synced_at IS NULL ORDER BY submitted_at, id LIMIT 100"),
  ]);
  process.stdout.write(`${JSON.stringify({
    benchmark: "phase6-local-homologation",
    generated_at: new Date().toISOString(),
    fixture_prefix: prefix,
    iterations,
    metrics: results(),
    query_plans: { customer_search: plans[0].rows[0]["QUERY PLAN"], erp_queue: plans[1].rows[0]["QUERY PLAN"] },
  }, null, 2)}\n`);
}

try {
  await main();
} finally {
  await cleanup();
}