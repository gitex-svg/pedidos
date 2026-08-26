import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import test, { after, before } from "node:test";
import { hashPassword } from "better-auth/crypto";
import { and, eq, inArray, like } from "drizzle-orm";
import {
  accounts, customers, db, integrationLogs, priceTableItems, priceTables, products,
  representatives, users,
} from "@workspace/db";
import app from "../app";

const stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
const prefix = `f3-${stamp}`;
const password = "TesteSeguro@2026";
const key = process.env.ERP_API_KEY!;
const source = (day: number) => `2026-04-${String(day).padStart(2, "0")}T12:00:00.000Z`;
const reference = "2026-06-15T12:00:00.000Z";
const emails = {
  rep: `rep-${prefix}@gitex.test`,
  unlinked: `unlinked-${prefix}@gitex.test`,
  admin: `admin-${prefix}@gitex.test`,
};

let server: Server;
let base = "";
let repCookie = "";
let unlinkedCookie = "";
let adminCookie = "";
let repUserId = "";
let repId = "";
let otherRepId = "";
let customerId = "";
let otherCustomerId = "";
let productId = "";
let sequence = 0;
const correlations: string[] = [];

async function createUser(email: string, role: "ADMIN" | "REPRESENTATIVE") {
  const [created] = await db.insert(users).values({ name: prefix, email, role, active: true })
    .returning({ id: users.id });
  await db.insert(accounts).values({
    id: randomUUID(), issuer: "local:credential", accountId: created.id,
    providerId: "credential", userId: created.id, password: await hashPassword(password),
  });
  return created.id;
}

async function login(email: string) {
  const response = await fetch(`${base}/v1/auth/login`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  assert.equal(response.status, 200);
  return response.headers.get("set-cookie")!.split(";")[0];
}

async function erp(entity: string, items: unknown[], options: { correlation?: string; token?: string | null } = {}) {
  const correlation = options.correlation ?? randomUUID();
  if (options.token !== null) correlations.push(correlation);
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (options.token !== null) headers.authorization = `Bearer ${options.token ?? key}`;
  return fetch(`${base}/v1/erp/${entity}/sync`, {
    method: "POST", headers,
    body: JSON.stringify({ correlation_id: correlation, items }),
  });
}

async function erpJson(entity: string, items: unknown[]) {
  const response = await erp(entity, items);
  const json = await response.json() as any;
  return { response, json };
}

function tableItem(
  code: string,
  type: "CUSTOMER" | "REPRESENTATIVE" | "STANDARD",
  options: Record<string, unknown> = {},
) {
  return {
    erp_code: code, name: code, price_type: type, valid_from: null, valid_until: null,
    active: true, source_updated_at: source(3), ...options,
  };
}

async function makeProduct(label: string, active = true) {
  sequence++;
  const erpId = `${prefix}-P-${label}-${sequence}`;
  const { response, json } = await erpJson("products", [{
    erp_id: erpId, code: `P${sequence}`, description: label, collection: prefix,
    group_code: "01", type_code: "02", product_code: String(sequence).padStart(4, "0").slice(-4),
    reference_code: String(sequence).padStart(8, "0").slice(-8),
    active, source_updated_at: source(2),
  }]);
  assert.equal(response.status, 200, JSON.stringify(json));
  const [row] = await db.select().from(products).where(eq(products.erpId, erpId));
  return row;
}

async function addTable(
  label: string,
  type: "CUSTOMER" | "REPRESENTATIVE" | "STANDARD",
  productErpId: string,
  price: string,
  options: Record<string, unknown> = {},
) {
  sequence++;
  const code = `${prefix}-T-${label}-${sequence}`;
  const scope = type === "CUSTOMER"
    ? { customer_erp_code: `${prefix}-C1` }
    : type === "REPRESENTATIVE" ? { representative_erp_code: `${prefix}-R1` } : {};
  const tableResponse = await erpJson("price-tables", [tableItem(code, type, { ...scope, ...options })]);
  assert.equal(tableResponse.response.status, 200, JSON.stringify(tableResponse.json));
  const itemResponse = await erpJson("price-table-items", [{
    price_table_erp_code: code, product_erp_id: productErpId, unit_price: price,
    active: true, source_updated_at: source(4),
  }]);
  assert.equal(itemResponse.response.status, 200, JSON.stringify(itemResponse.json));
  return code;
}

async function resolve(
  customer = customerId,
  product = productId,
  cookie = repCookie,
  date = reference,
) {
  return fetch(`${base}/v1/pricing/resolve?customerId=${customer}&productId=${product}&referenceDate=${encodeURIComponent(date)}`, {
    headers: { cookie },
  });
}

async function assertFound(
  response: Response,
  expected: {
    customerId: string;
    productId: string;
    representativeId: string;
    tableCode: string;
    unitPrice: string;
    origin: "CUSTOMER" | "REPRESENTATIVE" | "STANDARD";
  },
) {
  assert.equal(response.status, 200);
  const [table] = await db.select({ id: priceTables.id }).from(priceTables)
    .where(eq(priceTables.erpCode, expected.tableCode));
  assert.ok(table, `Expected price table ${expected.tableCode}`);
  const body = await response.json() as any;
  assert.deepEqual(body, {
    found: true,
    productId: expected.productId,
    customerId: expected.customerId,
    representativeId: expected.representativeId,
    unitPrice: expected.unitPrice,
    origin: expected.origin,
    priceTableId: table.id,
    priceTableErpCode: expected.tableCode,
  });
  assert.equal("priceTable" in body, false);
}

async function assertNotFound(response: Response, customer: string, product: string) {
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { found: false, productId: product, customerId: customer });
}

before(async () => {
  repUserId = await createUser(emails.rep, "REPRESENTATIVE");
  await createUser(emails.unlinked, "REPRESENTATIVE");
  await createUser(emails.admin, "ADMIN");
  server = app.listen(0);
  await new Promise<void>(resolveListening => server.once("listening", resolveListening));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Unable to start test HTTP server");
  base = `http://127.0.0.1:${address.port}/api`;
  repCookie = await login(emails.rep);
  unlinkedCookie = await login(emails.unlinked);
  adminCookie = await login(emails.admin);

  let seeded = await erpJson("representatives", [
    { erp_code: `${prefix}-R1`, name: "Linked representative", source_updated_at: source(1) },
    { erp_code: `${prefix}-R2`, name: "Other representative", source_updated_at: source(1) },
  ]);
  assert.equal(seeded.response.status, 200, JSON.stringify(seeded.json));
  [repId, otherRepId] = (await db.select().from(representatives)
    .where(inArray(representatives.erpCode, [`${prefix}-R1`, `${prefix}-R2`])))
    .sort((a, b) => a.erpCode.localeCompare(b.erpCode)).map(row => row.id);
  await db.update(representatives).set({ userId: repUserId }).where(eq(representatives.id, repId));

  seeded = await erpJson("customers", [
    { erp_code: `${prefix}-C1`, representative_erp_code: `${prefix}-R1`, corporate_name: "Own", source_updated_at: source(2) },
    { erp_code: `${prefix}-C2`, representative_erp_code: `${prefix}-R2`, corporate_name: "Other", source_updated_at: source(2) },
  ]);
  assert.equal(seeded.response.status, 200, JSON.stringify(seeded.json));
  [customerId, otherCustomerId] = (await db.select().from(customers)
    .where(inArray(customers.erpCode, [`${prefix}-C1`, `${prefix}-C2`])))
    .sort((a, b) => a.erpCode.localeCompare(b.erpCode)).map(row => row.id);
  productId = (await makeProduct("base")).id;
});

after(async () => {
  await db.delete(priceTableItems).where(inArray(
    priceTableItems.priceTableId,
    db.select({ id: priceTables.id }).from(priceTables).where(like(priceTables.erpCode, `${prefix}%`)),
  ));
  await db.delete(priceTables).where(like(priceTables.erpCode, `${prefix}%`));
  await db.delete(customers).where(like(customers.erpCode, `${prefix}%`));
  await db.delete(products).where(like(products.erpId, `${prefix}%`));
  await db.delete(representatives).where(like(representatives.erpCode, `${prefix}%`));
  if (correlations.length) await db.delete(integrationLogs).where(inArray(integrationLogs.correlationId, correlations));
  await db.delete(users).where(inArray(users.email, Object.values(emails)));
  await new Promise<void>((resolveClose, reject) => server.close(error => error ? reject(error) : resolveClose()));
});

test("CUSTOMER wins and inactive/future/past customer tables are ignored", async () => {
  const product = await makeProduct("customer-priority");
  await addTable("standard", "STANDARD", product.erpId, "10.000000");
  await addTable("rep", "REPRESENTATIVE", product.erpId, "20.000000");
  await addTable("inactive-customer", "CUSTOMER", product.erpId, "31.000000", { active: false });
  await addTable("future-customer", "CUSTOMER", product.erpId, "32.000000", { valid_from: "2026-06-16T00:00:00.000Z" });
  await addTable("past-customer", "CUSTOMER", product.erpId, "33.000000", { valid_until: "2026-06-14T23:59:59.000Z" });
  const winner = await addTable("customer", "CUSTOMER", product.erpId, "30.123456");
  await assertFound(await resolve(customerId, product.id), {
    customerId, productId: product.id, representativeId: repId, tableCode: winner,
    unitPrice: "30.123456", origin: "CUSTOMER",
  });
});

test("REPRESENTATIVE fallback wins over STANDARD and ignores inactive/out-of-validity tables", async () => {
  const product = await makeProduct("representative-priority");
  await addTable("standard-r", "STANDARD", product.erpId, "10.000000");
  await addTable("inactive-r", "REPRESENTATIVE", product.erpId, "21.000000", { active: false });
  await addTable("future-r", "REPRESENTATIVE", product.erpId, "22.000000", { valid_from: "2027-01-01T00:00:00.000Z" });
  await addTable("past-r", "REPRESENTATIVE", product.erpId, "23.000000", { valid_until: "2025-01-01T00:00:00.000Z" });
  const winner = await addTable("winner-r", "REPRESENTATIVE", product.erpId, "20.000001");
  await assertFound(await resolve(customerId, product.id), {
    customerId, productId: product.id, representativeId: repId, tableCode: winner,
    unitPrice: "20.000001", origin: "REPRESENTATIVE",
  });
});

test("STANDARD fallback ignores inactive/out-of-validity tables; no price has no sentinel", async () => {
  const product = await makeProduct("standard-only");
  await addTable("inactive-s", "STANDARD", product.erpId, "11.000000", { active: false });
  await addTable("future-s", "STANDARD", product.erpId, "12.000000", { valid_from: "2027-01-01T00:00:00.000Z" });
  await addTable("past-s", "STANDARD", product.erpId, "13.000000", { valid_until: "2025-01-01T00:00:00.000Z" });
  const winner = await addTable("winner-s", "STANDARD", product.erpId, "14.000000");
  await assertFound(await resolve(customerId, product.id), {
    customerId, productId: product.id, representativeId: repId, tableCode: winner,
    unitPrice: "14.000000", origin: "STANDARD",
  });

  const unpriced = await makeProduct("unpriced");
  await assertNotFound(await resolve(customerId, unpriced.id), customerId, unpriced.id);
});

test("validity boundaries are inclusive and dates immediately outside are excluded", async () => {
  const exactFrom = await makeProduct("exact-from");
  const exactFromTable = await addTable("exact-from", "STANDARD", exactFrom.erpId, "1.000001", { valid_from: reference });
  await assertFound(await resolve(customerId, exactFrom.id), {
    customerId, productId: exactFrom.id, representativeId: repId, tableCode: exactFromTable,
    unitPrice: "1.000001", origin: "STANDARD",
  });

  const exactUntil = await makeProduct("exact-until");
  const exactUntilTable = await addTable("exact-until", "STANDARD", exactUntil.erpId, "1.000002", { valid_until: reference });
  await assertFound(await resolve(customerId, exactUntil.id), {
    customerId, productId: exactUntil.id, representativeId: repId, tableCode: exactUntilTable,
    unitPrice: "1.000002", origin: "STANDARD",
  });

  const future = await makeProduct("future");
  await addTable("just-future", "STANDARD", future.erpId, "1.000003", { valid_from: "2026-06-15T12:00:00.001Z" });
  await assertNotFound(await resolve(customerId, future.id), customerId, future.id);
  const past = await makeProduct("past");
  await addTable("just-past", "STANDARD", past.erpId, "1.000004", { valid_until: "2026-06-15T11:59:59.999Z" });
  await assertNotFound(await resolve(customerId, past.id), customerId, past.id);
});

test("two applicable tables at the winning scope return explicit HTTP 409", async () => {
  const product = await makeProduct("ambiguous");
  await addTable("ambiguous-a", "CUSTOMER", product.erpId, "41.000000");
  await addTable("ambiguous-b", "CUSTOMER", product.erpId, "42.000000");
  await addTable("ambiguous-standard", "STANDARD", product.erpId, "1.000000");
  const response = await resolve(customerId, product.id);
  assert.equal(response.status, 409);
  const json = await response.json() as any;
  assert.equal(json.scope, "CUSTOMER");
  assert.match(json.error, /Mais de uma tabela/);
  assert.equal(json.priceTableIds.length, 2);
});

test("database rejects inverted price-table validity ranges", async () => {
  sequence++;
  await assert.rejects(
    db.insert(priceTables).values({
      erpCode: `${prefix}-DB-RANGE-${sequence}`,
      name: "invalid range",
      priceType: "STANDARD",
      active: true,
      validFrom: new Date("2026-06-16T00:00:00.000Z"),
      validUntil: new Date("2026-06-15T00:00:00.000Z"),
      sourceUpdatedAt: new Date(source(3)),
      lastSyncedAt: new Date(),
      updatedAt: new Date(),
    }),
    (error: unknown) => {
      const cause = error && typeof error === "object" && "cause" in error
        ? (error as { cause?: { message?: string } }).cause
        : undefined;
      return Boolean(cause?.message?.includes("price_tables_validity_range_check"));
    },
  );
});

test("pricing authorization and inactive/missing mappings are deterministic", async () => {
  await assertNotFound(await resolve(customerId, productId, repCookie), customerId, productId);
  assert.equal((await resolve(otherCustomerId, productId, repCookie)).status, 403);
  await assertNotFound(await resolve(otherCustomerId, productId, adminCookie), otherCustomerId, productId);
  assert.equal((await resolve(customerId, productId, unlinkedCookie)).status, 403);
  assert.equal((await resolve(randomUUID(), productId, adminCookie)).status, 404);
  assert.equal((await resolve(customerId, randomUUID(), adminCookie)).status, 404);
  const invalid = await fetch(`${base}/v1/pricing/resolve?customerId=not-a-uuid&productId=${productId}`, { headers: { cookie: adminCookie } });
  assert.equal(invalid.status, 400);

  const inactiveProduct = await makeProduct("inactive-product", false);
  assert.equal((await resolve(customerId, inactiveProduct.id, adminCookie)).status, 404);
  await db.update(customers).set({ active: false }).where(eq(customers.id, otherCustomerId));
  assert.equal((await resolve(otherCustomerId, productId, adminCookie)).status, 404);
  await db.update(customers).set({ active: true }).where(eq(customers.id, otherCustomerId));
  await db.update(representatives).set({ active: false }).where(eq(representatives.id, otherRepId));
  assert.equal((await resolve(otherCustomerId, productId, adminCookie)).status, 404);
  await db.update(representatives).set({ active: true }).where(eq(representatives.id, otherRepId));
});

test("price-table ERP endpoint authenticates, validates scope, reports stable missing references, and logs correlation", async () => {
  assert.equal((await erp("price-tables", [], { token: null })).status, 401);
  assert.equal((await erp("price-tables", [], { token: "wrong" })).status, 401);
  assert.equal((await erp("price-table-items", [], { token: null })).status, 401);
  assert.equal((await erp("price-table-items", [], { token: "wrong" })).status, 401);
  const correlation = randomUUID();
  const response = await erp("price-tables", [
    tableItem(`${prefix}-ERP-GOOD`, "STANDARD"),
    tableItem(`${prefix}-ERP-BAD-REP`, "REPRESENTATIVE", { representative_erp_code: `${prefix}-NO-REP` }),
    tableItem(`${prefix}-ERP-BAD-CUSTOMER`, "CUSTOMER", { customer_erp_code: `${prefix}-NO-CUSTOMER` }),
    tableItem(`${prefix}-ERP-INVALID`, "STANDARD", { customer_erp_code: `${prefix}-C1` }),
  ], { correlation });
  assert.equal(response.status, 207);
  const json = await response.json() as any;
  assert.equal(json.correlation_id, correlation);
  assert.deepEqual(json.results.map((result: any) => result.reason ?? result.status), [
    "created", "REPRESENTATIVE_NOT_FOUND", "CUSTOMER_NOT_FOUND", "VALIDATION_ERROR",
  ]);
  const [log] = await db.select().from(integrationLogs).where(eq(integrationLogs.correlationId, correlation));
  assert.equal(log.entity, "price-tables");
  assert.equal(log.received, 4);
  assert.equal(log.created, 1);
  assert.equal(log.errors, 3);
});

test("price table create/update/stale, logical deactivation, and mixed item batches are idempotent", async () => {
  const tableCode = `${prefix}-ERP-LIFECYCLE`;
  let result = await erpJson("price-tables", [tableItem(tableCode, "STANDARD")]);
  assert.equal(result.json.results[0].status, "created");
  result = await erpJson("price-tables", [tableItem(tableCode, "STANDARD", { name: "updated", source_updated_at: source(4) })]);
  assert.equal(result.json.results[0].status, "updated");
  for (const staleDate of [source(4), source(3)]) {
    result = await erpJson("price-tables", [tableItem(tableCode, "STANDARD", { name: "must-not-win", source_updated_at: staleDate })]);
    assert.deepEqual(result.json.results[0], {
      index: 0, external_id: tableCode, status: "ignored", reason: "STALE_SOURCE_VERSION",
    });
  }
  const product = await makeProduct("erp-items");
  result = await erpJson("price-table-items", [
    { price_table_erp_code: tableCode, product_erp_id: product.erpId, unit_price: "00012.340000", source_updated_at: source(5) },
    { price_table_erp_code: `${prefix}-NO-TABLE`, product_erp_id: product.erpId, unit_price: "1.000000", source_updated_at: source(5) },
    { price_table_erp_code: tableCode, product_erp_id: `${prefix}-NO-PRODUCT`, unit_price: "1.000000", source_updated_at: source(5) },
  ]);
  assert.equal(result.response.status, 207);
  assert.deepEqual(result.json.results.map((item: any) => item.reason ?? item.status), [
    "created", "PRICE_TABLE_NOT_FOUND", "PRODUCT_NOT_FOUND",
  ]);
  assert.deepEqual(result.json.results.map((item: any) => item.external_id), [
    product.erpId, product.erpId, `${prefix}-NO-PRODUCT`,
  ]);
  result = await erpJson("price-table-items", [{
    price_table_erp_code: tableCode, product_erp_id: product.erpId,
    unit_price: "13.000000", active: false, source_updated_at: source(6),
  }]);
  assert.equal(result.json.results[0].status, "updated");
  const [stored] = await db.select({
    active: priceTableItems.active,
    unitPrice: priceTableItems.unitPrice,
  }).from(priceTableItems)
    .innerJoin(priceTables, eq(priceTableItems.priceTableId, priceTables.id))
    .where(and(eq(priceTables.erpCode, tableCode), eq(priceTableItems.productId, product.id)));
  assert.equal(stored.active, false);
  assert.equal(stored.unitPrice, "13.000000");
  result = await erpJson("price-table-items", [{
    price_table_erp_code: tableCode, product_erp_id: product.erpId,
    unit_price: "14.000000", active: true, source_updated_at: source(6),
  }]);
  assert.equal(result.json.results[0].reason, "STALE_SOURCE_VERSION");
});

test("prices preserve six decimals, reject invalid precision, canonicalize zeros, and use external identity uniqueness", async () => {
  const product = await makeProduct("precision");
  const tableCode = `${prefix}-PRECISION`;
  const suppliedInternalId = randomUUID();
  let result = await erpJson("price-tables", [{
    ...tableItem(tableCode, "STANDARD"), id: suppliedInternalId,
  }]);
  assert.equal(result.json.results[0].external_id, tableCode);
  const [table] = await db.select().from(priceTables).where(eq(priceTables.erpCode, tableCode));
  assert.notEqual(table.id, suppliedInternalId);

  result = await erpJson("price-table-items", [{
    id: randomUUID(), price_table_erp_code: tableCode, product_erp_id: product.erpId,
    unit_price: "000000000001.234567", source_updated_at: source(5),
  }]);
  assert.equal(result.response.status, 200);
  const [stored] = await db.select().from(priceTableItems)
    .where(and(eq(priceTableItems.priceTableId, table.id), eq(priceTableItems.productId, product.id)));
  assert.equal(stored.unitPrice, "1.234567");
  await assertFound(await resolve(customerId, product.id, adminCookie), {
    customerId, productId: product.id, representativeId: repId, tableCode,
    unitPrice: "1.234567", origin: "STANDARD",
  });

  for (const invalidPrice of ["1.1234567", "1"]) {
    result = await erpJson("price-table-items", [{
      price_table_erp_code: tableCode, product_erp_id: product.erpId,
      unit_price: invalidPrice, source_updated_at: source(6),
    }]);
    assert.equal(result.response.status, 207);
    assert.equal(result.json.results[0].reason, "VALIDATION_ERROR");
  }
  result = await erpJson("price-table-items", [{
    price_table_erp_code: tableCode, product_erp_id: product.erpId,
    unit_price: "2.5", source_updated_at: source(6),
  }]);
  assert.equal(result.json.results[0].status, "updated");
  const count = await db.select().from(priceTableItems)
    .where(and(eq(priceTableItems.priceTableId, table.id), eq(priceTableItems.productId, product.id)));
  assert.equal(count.length, 1);
  assert.equal(count[0].unitPrice, "2.500000");
});

test("ERP batches enforce the 500 item limit", async () => {
  const response = await erp("price-tables", Array.from({ length: 501 }, (_, index) =>
    tableItem(`${prefix}-LIMIT-${index}`, "STANDARD")));
  assert.equal(response.status, 400);
  const json = await response.json() as any;
  assert.equal(json.error, "Lote inválido.");
});