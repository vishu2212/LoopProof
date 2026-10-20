// Guards that the UI lifecycle never drifts from the Solidity enum.
// Run with: node --test web/tests  (Node 22.18+/24 strips TypeScript types natively; no extra deps.)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ALTERNATIVE_OUTCOMES,
  BATCH_STATES,
  CANONICAL_STAGES,
  reviewStatusFor,
} from "../lib/lifecycle.ts";

const sol = readFileSync(new URL("../../contracts/LoopProofTypes.sol", import.meta.url), "utf8");
const solMembers = (sol.match(/enum\s+BatchState\s*\{([^}]*)\}/) as RegExpMatchArray)[1]
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

test("UI BATCH_STATES matches Solidity BatchState enum order", () => {
  assert.deepEqual([...BATCH_STATES], solMembers);
});

test("canonical lifecycle is exactly the five approved stages, in order", () => {
  assert.deepEqual(
    [...CANONICAL_STAGES],
    ["REGISTERED", "COLLECTED", "RECEIVED", "PROCESSED_CLAIMED", "VERIFIED"],
  );
});

test("RETURNED, REJECTED, CANCELLED are alternatives, not canonical stages", () => {
  assert.deepEqual([...ALTERNATIVE_OUTCOMES], ["RETURNED", "REJECTED", "CANCELLED"]);
  for (const o of ALTERNATIVE_OUTCOMES) assert.ok(!(CANONICAL_STAGES as readonly string[]).includes(o));
});

test("'Pending verifier review' is a review status, never a lifecycle state", () => {
  assert.equal(reviewStatusFor("PROCESSED_CLAIMED"), "Pending verifier review");
  assert.ok(!(BATCH_STATES as readonly string[]).includes("PENDING_VERIFIER_REVIEW"));
  assert.ok(!BATCH_STATES.some((s) => /pending/i.test(s)));
});
