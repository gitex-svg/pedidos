import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import type { Server } from "node:http";
import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { and, eq, inArray, like } from "drizzle-orm";
import { accounts, carriers, customers, db, integrationLogs, paymentTerms, products, representatives, users } from "@workspace/db";
import app from "../app";

const stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
const prefix = `f2-${stamp}`;
const key = process.env.ERP_API_KEY!;
const password = "TesteSeguro@2026";
let server: Server, base = "", repCookie = "", adminCookie = "", repUserId = "", adminUserId = "";
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
  adminUserId = await user("ADMIN");
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

test("preserves supplied correlation and generates/stores one when absent", async () => {
  const supplied = randomUUID();
  const suppliedResponse = await erp("carriers", { correlation_id: supplied, items: [] });
  assert.equal((await suppliedResponse.json() as any).correlation_id, supplied);
  assert.equal((await db.select().from(integrationLogs).where(eq(integrationLogs.correlationId, supplied))).length, 1);
  const generatedResponse = await erp("carriers", { items: [] });
  const generated = (await generatedResponse.json() as any).correlation_id;
  assert.match(generated, /^[0-9a-f-]{36}$/);
  assert.equal((await db.select().from(integrationLogs).where(eq(integrationLogs.correlationId, generated))).length, 1);
});

test("all ERP entities enforce the exact create/newer/equal/older version matrix", async () => {
  const createdAt = at(10), newerAt = at(12), olderAt = at(11);
  async function outcome(path: string, item: Record<string, unknown>) {
    const response = await erp(path, { items: [item] });
    assert.equal(response.status, 200);
    return (await response.json() as any).results[0] as { status: string; reason?: string };
  }
  function assertIgnored(result: { status: string; reason?: string }) {
    assert.deepEqual(result, { ...result, status: "ignored", reason: "STALE_SOURCE_VERSION" });
  }

  const representativeCode = `${prefix}-MATRIX-R`;
  const representativeBase = { erp_code: representativeCode, name: "Matrix representative baseline", source_updated_at: createdAt };
  assert.equal((await outcome("representatives", representativeBase)).status, "created");
  const [matrixRepresentative] = await db.select().from(representatives).where(eq(representatives.erpCode, representativeCode));
  await db.update(representatives).set({ userId: adminUserId }).where(eq(representatives.id, matrixRepresentative.id));
  assert.equal((await outcome("representatives", { ...representativeBase, name: "Matrix representative newer", source_updated_at: newerAt })).status, "updated");
  assertIgnored(await outcome("representatives", { ...representativeBase, name: "Matrix representative equal conflict", source_updated_at: newerAt }));
  assertIgnored(await outcome("representatives", { ...representativeBase, name: "Matrix representative older conflict", source_updated_at: olderAt }));
  const [storedRepresentative] = await db.select().from(representatives).where(eq(representatives.erpCode, representativeCode));
  assert.equal(storedRepresentative.name, "Matrix representative newer");
  assert.equal(storedRepresentative.sourceUpdatedAt?.toISOString(), new Date(newerAt).toISOString());
  assert.equal(storedRepresentative.userId, adminUserId);

  const customerCode = `${prefix}-MATRIX-C`;
  const customerBase = { erp_code: customerCode, representative_erp_code: representativeCode, corporate_name: "Matrix customer baseline", source_updated_at: createdAt };
  assert.equal((await outcome("customers", customerBase)).status, "created");
  assert.equal((await outcome("customers", { ...customerBase, corporate_name: "Matrix customer newer", source_updated_at: newerAt })).status, "updated");
  assertIgnored(await outcome("customers", { ...customerBase, corporate_name: "Matrix customer equal conflict", source_updated_at: newerAt }));
  assertIgnored(await outcome("customers", { ...customerBase, corporate_name: "Matrix customer older conflict", source_updated_at: olderAt }));
  const [storedCustomer] = await db.select().from(customers).where(eq(customers.erpCode, customerCode));
  assert.equal(storedCustomer.corporateName, "Matrix customer newer");
  assert.equal(storedCustomer.sourceUpdatedAt.toISOString(), new Date(newerAt).toISOString());
  assert.equal(storedCustomer.representativeId, storedRepresentative.id);

  const productId = `${prefix}-MATRIX-P`;
  const productBase = {
    erp_id: productId, code: `${prefix}-matrix`, description: "Matrix product baseline",
    group_code: "01", type_code: "02", product_code: "0007", reference_code: "00000007",
    source_updated_at: createdAt,
  };
  assert.equal((await outcome("products", productBase)).status, "created");
  assert.equal((await outcome("products", { ...productBase, description: "Matrix product newer", source_updated_at: newerAt })).status, "updated");
  assertIgnored(await outcome("products", { ...productBase, description: "Matrix product equal conflict", source_updated_at: newerAt }));
  assertIgnored(await outcome("products", { ...productBase, description: "Matrix product older conflict", source_updated_at: olderAt }));
  const [storedProduct] = await db.select().from(products).where(eq(products.erpId, productId));
  assert.equal(storedProduct.description, "Matrix product newer");
  assert.equal(storedProduct.sourceUpdatedAt.toISOString(), new Date(newerAt).toISOString());

  const termCode = `${prefix}-MATRIX-T`;
  const termBase = { erp_code: termCode, description: "Matrix term baseline", source_updated_at: createdAt };
  assert.equal((await outcome("payment-terms", termBase)).status, "created");
  assert.equal((await outcome("payment-terms", { ...termBase, description: "Matrix term newer", source_updated_at: newerAt })).status, "updated");
  assertIgnored(await outcome("payment-terms", { ...termBase, description: "Matrix term equal conflict", source_updated_at: newerAt }));
  assertIgnored(await outcome("payment-terms", { ...termBase, description: "Matrix term older conflict", source_updated_at: olderAt }));
  const [storedTerm] = await db.select().from(paymentTerms).where(eq(paymentTerms.erpCode, termCode));
  assert.equal(storedTerm.description, "Matrix term newer");
  assert.equal(storedTerm.sourceUpdatedAt.toISOString(), new Date(newerAt).toISOString());

  const carrierCode = `${prefix}-MATRIX-K`;
  const carrierBase = { erp_code: carrierCode, name: "Matrix carrier baseline", source_updated_at: createdAt };
  assert.equal((await outcome("carriers", carrierBase)).status, "created");
  assert.equal((await outcome("carriers", { ...carrierBase, name: "Matrix carrier newer", source_updated_at: newerAt })).status, "updated");
  assertIgnored(await outcome("carriers", { ...carrierBase, name: "Matrix carrier equal conflict", source_updated_at: newerAt }));
  assertIgnored(await outcome("carriers", { ...carrierBase, name: "Matrix carrier older conflict", source_updated_at: olderAt }));
  const [storedCarrier] = await db.select().from(carriers).where(eq(carriers.erpCode, carrierCode));
  assert.equal(storedCarrier.name, "Matrix carrier newer");
  assert.equal(storedCarrier.sourceUpdatedAt.toISOString(), new Date(newerAt).toISOString());
});

test("ERP syncs representatives/customers idempotently and scopes customer visibility", async () => {
  const repA = `${prefix}-RA`, repB = `${prefix}-RB`;
  assert.equal((await erp("representatives", { items: [{ erp_code: repA, name: "Rep A", source_updated_at: at(1) }, { erp_code: repB, name: "Rep B", source_updated_at: at(1) }] })).status, 200);
  const [a] = await db.select().from(representatives).where(eq(representatives.erpCode, repA));
  await db.update(representatives).set({ userId: repUserId }).where(eq(representatives.id, a.id));
  await erp("representatives", { items: [{ erp_code: repA, name: "Rep A updated", source_updated_at: at(2) }] });
  const [updated] = await db.select().from(representatives).where(eq(representatives.erpCode, repA));
  assert.equal(updated.userId, repUserId);
  const representativeStale = await erp("representatives", { items: [{ erp_code: repA, name: "Old", source_updated_at: at(1) }] });
  assert.deepEqual((await representativeStale.json() as any).results.map((result: any) => [result.status, result.reason]), [["ignored", "STALE_SOURCE_VERSION"]]);
  const customersBatch = { items: [
    { erp_code: `${prefix}-CA`, representative_erp_code: repA, corporate_name: `${prefix}-scope Alpha Corp`, cnpj_cpf: "001", source_updated_at: at(2) },
    { erp_code: `${prefix}-CB`, representative_erp_code: repB, corporate_name: `${prefix}-scope Beta Corp`, cnpj_cpf: "002", source_updated_at: at(2) },
  ] };
  assert.equal((await erp("customers", customersBatch)).status, 200);
  const customerEqual = await erp("customers", { items: [{ ...customersBatch.items[0], source_updated_at: at(2) }] });
  assert.deepEqual((await customerEqual.json() as any).results.map((result: any) => [result.status, result.reason]), [["ignored", "STALE_SOURCE_VERSION"]]);
  const mixedCustomer = await erp("customers", { items: [
    { erp_code: `${prefix}-CC`, representative_erp_code: repA, corporate_name: `${prefix}-scope Valid`, source_updated_at: at(3) },
    { erp_code: `${prefix}-MISSING`, representative_erp_code: `${prefix}-UNKNOWN`, corporate_name: "Missing", source_updated_at: at(3) },
  ] });
  const mixedCustomerJson = await mixedCustomer.json() as any;
  assert.equal(mixedCustomer.status, 207);
  assert.deepEqual(mixedCustomerJson.results.map((result: any) => [result.status, result.reason]), [["created", undefined], ["error", "REPRESENTATIVE_NOT_FOUND"]]);
  await erp("customers", customersBatch);
  assert.equal((await db.select().from(customers).where(inArray(customers.erpCode, [`${prefix}-CA`, `${prefix}-CB`, `${prefix}-CC`]))).length, 3);
  const own = await fetch(`${base}/v1/customers?q=${prefix}-scope`, { headers: auth(repCookie) }); const ownJson = await own.json() as any;
  assert.equal(ownJson.items.length, 2); assert.ok(ownJson.items.every((item: any) => item.representative_id === a.id));
  const all = await fetch(`${base}/v1/customers?q=${prefix}-scope`, { headers: auth(adminCookie) }); assert.equal((await all.json() as any).items.length, 3);
});

test("products support identity filters, pagination, active visibility, stale protection and partial batches", async () => {
  const item = (id: string, codes: string[], description: string, active = true, date = at(3)) => ({ erp_id: id, code: `${prefix}-${codes[2]}`, description, group_code: codes[0], type_code: codes[1], product_code: codes[2], reference_code: codes[3], collection: prefix, packaging: "Box", width: "10", color: "Red", active, source_updated_at: date });
  const first = item(`${prefix}-P001`, ["01", "02", "0001", "00000001"], `${prefix} Zero product`);
  const second = item(`${prefix}-P002`, ["01", "03", "0002", "00000002"], `${prefix} Other product`, false);
  let response = await erp("products", { items: [first, second, { erp_id: "", source_updated_at: at(3) }] }); assert.equal(response.status, 207);
  const partial = await response.json() as any; assert.equal(partial.errors, 1); assert.equal(partial.results.length, 3);
  assert.equal(partial.results[2].reason, "VALIDATION_ERROR");
  const duplicate = await erp("products", { items: [first, second] });
  const duplicateJson = await duplicate.json() as any;
  assert.ok(duplicateJson.results.every((result: any) => result.status === "ignored" && result.reason === "STALE_SOURCE_VERSION"));
  assert.equal((await db.select().from(products).where(inArray(products.erpId, [first.erp_id, second.erp_id]))).length, 2);
  const [stored] = await db.select().from(products).where(eq(products.erpId, first.erp_id)); assert.equal(stored.productCode, "0001");
  for (const query of [`collection=${prefix}&group_code=01`, `collection=${prefix}&group_code=01&type_code=02`, `collection=${prefix}&group_code=01&type_code=02&product_code=0001`, `collection=${prefix}&group_code=01&type_code=02&product_code=0001&reference_code=00000001`, `q=${prefix}%20Zero`, `description=${prefix}%20Zero`]) {
    const r = await fetch(`${base}/v1/products?${query}`, { headers: auth(repCookie) }); assert.equal((await r.json() as any).items.length, 1);
  }
  const page = await fetch(`${base}/v1/products?collection=${prefix}&pageSize=1&page=1`, { headers: auth(repCookie) }); const pageJson = await page.json() as any;
  assert.deepEqual({ page: pageJson.page, pageSize: pageJson.pageSize, totalItems: pageJson.totalItems, totalPages: pageJson.totalPages }, { page: 1, pageSize: 1, totalItems: 1, totalPages: 1 });
  const clamped = await fetch(`${base}/v1/products?collection=${prefix}&pageSize=500`, { headers: auth(repCookie) });
  assert.equal((await clamped.json() as any).pageSize, 100);
  const defaults = await fetch(`${base}/v1/products?collection=${prefix}`, { headers: auth(repCookie) });
  assert.equal((await defaults.json() as any).pageSize, 20);
  const secondPage = await fetch(`${base}/v1/products?collection=${prefix}&pageSize=1&page=2`, { headers: auth(repCookie) });
  assert.equal((await secondPage.json() as any).items.length, 0);
  const productStale = await erp("products", { items: [item(first.erp_id, ["01", "02", "0001", "00000001"], "Older", true, at(1))] });
  assert.equal((await productStale.json() as any).results[0].reason, "STALE_SOURCE_VERSION");
  const [fresh] = await db.select().from(products).where(eq(products.erpId, first.erp_id)); assert.equal(fresh.description, `${prefix} Zero product`);
  const newer = item(first.erp_id, ["01", "02", "0001", "00000001"], `${prefix} Concurrent newer`, true, at(6));
  const older = item(first.erp_id, ["01", "02", "0001", "00000001"], `${prefix} Concurrent older`, true, at(5));
  const outcomes = await Promise.all(Array.from({ length: 8 }, (_, index) => erp("products", { items: [index % 2 ? newer : older] })));
  assert.ok(outcomes.every(r => r.status === 200));
  const [raced] = await db.select().from(products).where(eq(products.erpId, first.erp_id));
  assert.equal(raced.sourceUpdatedAt.toISOString(), new Date(at(6)).toISOString());
  assert.equal(raced.description, `${prefix} Concurrent newer`);
});

test("reference_code accepts 1 to 8 text characters in ERP sync and product filters", async () => {
  const references = ["A", "01", "CPA/1", "01CR", "12345678"];
  const items = references.map((referenceCode, index) => ({
    erp_id: `${prefix}-REF-${index}`,
    code: `${prefix}-ref-${index}`,
    description: `${prefix} reference ${referenceCode}`,
    group_code: "01",
    type_code: "01",
    product_code: String(index + 1).padStart(4, "0"),
    reference_code: referenceCode,
    source_updated_at: at(7),
  }));

  const validResponse = await erp("products", { items });
  assert.equal(validResponse.status, 200);
  const validJson = await validResponse.json() as any;
  assert.deepEqual(validJson.results.map((result: any) => result.status), references.map(() => "created"));

  const stored = await db.select({ referenceCode: products.referenceCode })
    .from(products)
    .where(like(products.erpId, `${prefix}-REF-%`));
  assert.deepEqual(stored.map(product => product.referenceCode).sort(), [...references].sort());

  const filtered = await fetch(`${base}/v1/products?reference_code=CPA%2F1`, { headers: auth(repCookie) });
  assert.equal(filtered.status, 200);
  const filteredJson = await filtered.json() as any;
  assert.equal(filteredJson.items.length, 1);
  assert.equal(filteredJson.items[0].reference_code, "CPA/1");

  for (const [index, referenceCode] of ["", "123456789"].entries()) {
    const response = await erp("products", {
      items: [{
        ...items[0],
        erp_id: `${prefix}-REF-INVALID-${index}`,
        code: `${prefix}-ref-invalid-${index}`,
        reference_code: referenceCode,
        source_updated_at: at(8 + index),
      }],
    });
    assert.equal(response.status, 207);
    const json = await response.json() as any;
    assert.equal(json.results[0].status, "error");
    assert.equal(json.results[0].reason, "VALIDATION_ERROR");
  }
});

test("payment terms and carriers are idempotent and representatives see active records only", async () => {
  const terms = { items: [{ erp_code: `${prefix}-T`, description: "Term", active: true, source_updated_at: at(4) }, { erp_code: `${prefix}-TI`, description: "Inactive", active: false, source_updated_at: at(4) }] };
  const carrierBatch = { items: [{ erp_code: `${prefix}-C`, name: "Carrier", active: true, source_updated_at: at(4) }, { erp_code: `${prefix}-CI`, name: "Inactive carrier", active: false, source_updated_at: at(4) }] };
  await erp("payment-terms", terms); await erp("payment-terms", terms); await erp("carriers", carrierBatch); await erp("carriers", carrierBatch);
  const termStale = await erp("payment-terms", { items: [{ ...terms.items[0], description: "Old", source_updated_at: at(3) }] });
  const carrierEqual = await erp("carriers", { items: [{ ...carrierBatch.items[0], source_updated_at: at(4) }] });
  assert.equal((await termStale.json() as any).results[0].reason, "STALE_SOURCE_VERSION");
  assert.equal((await carrierEqual.json() as any).results[0].reason, "STALE_SOURCE_VERSION");
  assert.equal((await db.select().from(paymentTerms).where(inArray(paymentTerms.erpCode, [`${prefix}-T`, `${prefix}-TI`]))).length, 2);
  assert.equal((await db.select().from(carriers).where(inArray(carriers.erpCode, [`${prefix}-C`, `${prefix}-CI`]))).length, 2);
  assert.equal((await (await fetch(`${base}/v1/payment-terms`, { headers: auth(repCookie) })).json() as any).items.filter((x: any) => [`${prefix}-T`, `${prefix}-TI`].includes(x.erp_code)).length, 1);
  assert.equal((await (await fetch(`${base}/v1/carriers`, { headers: auth(repCookie) })).json() as any).items.filter((x: any) => [`${prefix}-C`, `${prefix}-CI`].includes(x.erp_code)).length, 1);
  for (const path of ["customers", "products", "payment-terms", "carriers"]) {
    const fallback = await fetch(`${base}/v1/${path}?limit=7`, { headers: auth(path === "customers" ? adminCookie : repCookie) });
    assert.equal((await fallback.json() as any).pageSize, 7);
    const priority = await fetch(`${base}/v1/${path}?pageSize=3&limit=7`, { headers: auth(path === "customers" ? adminCookie : repCookie) });
    assert.equal((await priority.json() as any).pageSize, 3);
    const clamped = await fetch(`${base}/v1/${path}?pageSize=500`, { headers: auth(path === "customers" ? adminCookie : repCookie) });
    assert.equal((await clamped.json() as any).pageSize, 100);
  }
});