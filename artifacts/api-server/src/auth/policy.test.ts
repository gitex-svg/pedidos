import assert from "node:assert/strict";
import test from "node:test";
import { hasRole } from "./policy";

test("ADMIN pode acessar operações administrativas", () => {
  assert.equal(hasRole("ADMIN", ["ADMIN"]), true);
});

test("REPRESENTATIVE não pode acessar operações administrativas", () => {
  assert.equal(hasRole("REPRESENTATIVE", ["ADMIN"]), false);
});

test("ambos os perfis podem acessar operações compartilhadas", () => {
  assert.equal(hasRole("REPRESENTATIVE", ["ADMIN", "REPRESENTATIVE"]), true);
});