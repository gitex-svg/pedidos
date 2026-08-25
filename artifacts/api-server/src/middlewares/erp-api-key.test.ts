import assert from "node:assert/strict";
import test from "node:test";
import { requireErpApiKey } from "./erp-api-key";

function request(value?: string) {
  return { get: (name: string) => name === "authorization" ? value : undefined } as never;
}

function response() {
  const result = { statusCode: 200, body: undefined as unknown };
  return {
    result,
    value: {
      status(code: number) { result.statusCode = code; return this; },
      json(body: unknown) { result.body = body; return this; },
    } as never,
  };
}

test("ERP middleware accepts only the configured bearer token", () => {
  const previous = process.env.ERP_API_KEY;
  process.env.ERP_API_KEY = "high-entropy-secret";
  try {
    let called = false;
    const valid = response();
    requireErpApiKey(request("Bearer high-entropy-secret"), valid.value, (() => { called = true; }) as never);
    assert.equal(called, true);

    const invalid = response();
    requireErpApiKey(request("Bearer wrong"), invalid.value, (() => assert.fail()) as never);
    assert.equal(invalid.result.statusCode, 401);
    assert.deepEqual(invalid.result.body, { error: "Credencial ERP inválida." });
  } finally {
    if (previous === undefined) delete process.env.ERP_API_KEY;
    else process.env.ERP_API_KEY = previous;
  }
});

test("ERP middleware fails closed when secret is absent", () => {
  const previous = process.env.ERP_API_KEY;
  delete process.env.ERP_API_KEY;
  try {
    const res = response();
    requireErpApiKey(request("Bearer anything"), res.value, (() => assert.fail()) as never);
    assert.equal(res.result.statusCode, 503);
  } finally {
    if (previous !== undefined) process.env.ERP_API_KEY = previous;
  }
});