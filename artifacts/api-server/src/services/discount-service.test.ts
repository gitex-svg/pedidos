import assert from "node:assert/strict";
import test from "node:test";
import { discountService, multiplyDecimal, sumMoney } from "./discount-service";

test("DiscountService applies four discounts in cascade with exact fixed-point arithmetic", () => {
  assert.equal(discountService.applyCascade("100.000000", ["10", "5", "3", "2"]), "81.276300");
  assert.equal(discountService.applyCascade("100.000000", ["0", "0", "0", "0"]), "100.000000");
  assert.equal(discountService.applyCascade("100.000000", ["100", "0", "0", "0"]), "0.000000");
  assert.notEqual(discountService.applyCascade("100.000000", ["10", "5", "3", "2"]), "80.000000");
});

test("item ROUND_HALF_UP totals and order totals sum already rounded items", () => {
  assert.equal(multiplyDecimal("2.994300", 6, "3.0000", 4, 2), "8.98");
  assert.equal(multiplyDecimal("1.667000", 6, "3.0000", 4, 2), "5.00");
  assert.equal(sumMoney(["8.98", "5.00"]), "13.98");
});