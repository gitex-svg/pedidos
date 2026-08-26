import assert from "node:assert/strict";
import test from "node:test";
import { SubmissionLock } from "./submission-lock.ts";

test("submission lock rejects a duplicate until the request settles", () => {
  const lock = new SubmissionLock();

  assert.equal(lock.acquire(), true);
  assert.equal(lock.acquire(), false);

  lock.release();
  assert.equal(lock.acquire(), true);
});