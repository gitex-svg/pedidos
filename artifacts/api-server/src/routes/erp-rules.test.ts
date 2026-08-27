import assert from "node:assert/strict";
import test from "node:test";
import { ResolvePriceQueryParams } from "@workspace/api-zod";
import { erpBatchSchema, erpItemSchemas, isStale } from "./erp";

test("product ERP codes remain strings and preserve leading zeros", () => {
  const result = erpItemSchemas.products.parse({
    erp_id: "000123",
    code: "000045",
    description: "Fita",
    group_code: "01",
    type_code: "02",
    product_code: "0045",
    reference_code: "00000009",
    active: false,
    source_updated_at: "2026-01-01T00:00:00Z",
  });
  assert.equal(result.erp_id, "000123");
  assert.equal(result.product_code, "0045");
  assert.equal(result.active, false);
});

test("reference_code preserves text and accepts 1 to 8 characters", () => {
  for (const referenceCode of ["A", "01", "CPA/1", "01CR", "12345678"]) {
    const result = erpItemSchemas.products.parse({
      erp_id: `product-${referenceCode}`,
      code: "FT-001",
      description: "Fita",
      group_code: "01",
      type_code: "02",
      product_code: "0045",
      reference_code: referenceCode,
      active: true,
      source_updated_at: "2026-01-01T00:00:00Z",
    });
    assert.equal(result.reference_code, referenceCode);
  }

  assert.equal(erpItemSchemas.products.safeParse({
    erp_id: "product-empty-reference",
    code: "FT-001",
    description: "Fita",
    group_code: "01",
    type_code: "02",
    product_code: "0045",
    reference_code: "",
    source_updated_at: "2026-01-01T00:00:00Z",
  }).success, false);
  assert.equal(erpItemSchemas.products.safeParse({
    erp_id: "product-long-reference",
    code: "FT-001",
    description: "Fita",
    group_code: "01",
    type_code: "02",
    product_code: "0045",
    reference_code: "123456789",
    source_updated_at: "2026-01-01T00:00:00Z",
  }).success, false);
});

test("batch limit is 500 and validation remains per item", () => {
  assert.equal(erpBatchSchema.safeParse({ items: Array(500).fill({}) }).success, true);
  assert.equal(erpBatchSchema.safeParse({ items: Array(501).fill({}) }).success, false);
  assert.equal(erpItemSchemas.carriers.safeParse({ erp_code: "", name: "", source_updated_at: "bad" }).success, false);
});

test("equal and older source timestamps are stale", () => {
  const current = new Date("2026-02-02T12:00:00Z");
  assert.equal(isStale(current, new Date("2026-02-02T12:00:00Z")), true);
  assert.equal(isStale(current, new Date("2026-02-01T12:00:00Z")), true);
  assert.equal(isStale(current, new Date("2026-02-03T12:00:00Z")), false);
});

test("generated pricing query contract coerces an HTTP date-time string", () => {
  const parsed = ResolvePriceQueryParams.parse({
    customerId: "11111111-1111-4111-8111-111111111111",
    productId: "22222222-2222-4222-8222-222222222222",
    referenceDate: "2026-06-15T12:30:00-03:00",
  });
  assert.ok(parsed.referenceDate instanceof Date);
  assert.equal(parsed.referenceDate.toISOString(), "2026-06-15T15:30:00.000Z");
});