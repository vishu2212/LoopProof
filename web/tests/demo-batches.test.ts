// Tests for the shared demo-data source and the reusable /batches/[batchId] route.
// Run with: npm test  (node --test; Node 22.18+/24 strips TypeScript types natively).
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import {
  DEMO_BATCHES,
  DEMO_DATA_NOTICE,
  getBatch,
  getStaticBatchIds,
} from "../lib/demo-data.ts";
import { impactStatus } from "../lib/impact.ts";
import {
  ALLOWED_TRANSITIONS,
  ALTERNATIVE_OUTCOMES,
  BATCH_STATES,
  CANONICAL_STAGES,
  REJECT_REASONS,
  RETURN_REASONS,
  reviewStatusFor,
  type BatchState,
} from "../lib/lifecycle.ts";

const EXPECTED_IDS = [
  "DEMO-001",
  "DEMO-002",
  "DEMO-003",
  "DEMO-004",
  "DEMO-005",
  "DEMO-006",
  "DEMO-007",
];
const REVIEW_STATUS_TITLES = [
  "Pending verifier review",
  "Awaiting resubmission",
  "Review complete",
];
const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

// ---------------------------------------------------------------------------
// Route generation
// ---------------------------------------------------------------------------
test("route: one dynamic route /batches/[batchId] exists; the old [id] route is gone", () => {
  assert.ok(existsSync(new URL("../app/batches/[batchId]/page.tsx", import.meta.url)));
  assert.ok(!existsSync(new URL("../app/batches/[id]", import.meta.url)));
});

test("route: generateStaticParams is driven by getStaticBatchIds and unknown IDs 404", () => {
  const page = read("../app/batches/[batchId]/page.tsx");
  assert.match(page, /export function generateStaticParams/);
  assert.match(page, /getStaticBatchIds\(\)\.map\(\(batchId\) => \(\{ batchId \}\)\)/);
  assert.match(page, /export const dynamicParams = false/);
  assert.match(page, /if \(!batch\) notFound\(\)/);
});

test("route: static params cover exactly the dashboard's batches, once each", () => {
  const ids = getStaticBatchIds();
  assert.deepEqual(ids, DEMO_BATCHES.map((b) => b.id));
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(ids, EXPECTED_IDS);
  for (const id of ids) assert.ok(getBatch(id), `${id} should resolve`);
});

test("single source: page components contain no hardcoded batch IDs or batch data", () => {
  for (const file of [
    "../app/page.tsx",
    "../app/batches/[batchId]/page.tsx",
    "../app/not-found.tsx",
  ]) {
    assert.doesNotMatch(read(file), /DEMO-\d{3}/, `${file} must read IDs from demo-data`);
  }
  assert.match(read("../app/page.tsx"), /DEMO_BATCHES/);
});

// ---------------------------------------------------------------------------
// All demo IDs, valid states
// ---------------------------------------------------------------------------
test("all seven dashboard demo IDs exist, are unique, and use the DEMO-NNN format", () => {
  assert.deepEqual(DEMO_BATCHES.map((b) => b.id), EXPECTED_IDS);
  for (const b of DEMO_BATCHES) assert.match(b.id, /^DEMO-\d{3}$/);
});

test("every batch has a valid, non-NONE lifecycle state", () => {
  for (const b of DEMO_BATCHES) {
    assert.ok((BATCH_STATES as readonly string[]).includes(b.state), `${b.id}: ${b.state}`);
    assert.notEqual(b.state, "NONE");
    const known = [...CANONICAL_STAGES, ...ALTERNATIVE_OUTCOMES] as readonly string[];
    assert.ok(known.includes(b.state));
  }
});

test("each batch's timeline is a valid lifecycle path ending in the batch's actual state", () => {
  for (const b of DEMO_BATCHES) {
    const path = b.timeline.filter((e) => e.type === "transition").map((e) => e.toState!);
    assert.ok(path.length > 0, `${b.id} has no transitions`);
    let prev: BatchState = "NONE";
    for (const to of path) {
      assert.ok(ALLOWED_TRANSITIONS[prev].includes(to), `${b.id}: ${prev} -> ${to} is not allowed`);
      prev = to;
    }
    assert.equal(prev, b.state, `${b.id}: last transition must equal state`);
    assert.equal(path[0], "REGISTERED");
  }
});

test("timelines are chronological and lastUpdated equals the final event time", () => {
  for (const b of DEMO_BATCHES) {
    const times = b.timeline.map((e) => Date.parse(e.at));
    for (const t of times) assert.ok(!Number.isNaN(t));
    assert.deepEqual([...times].sort((a, c) => a - c), times, `${b.id} out of order`);
    assert.equal(Date.parse(b.lastUpdated), times[times.length - 1], `${b.id} lastUpdated`);
  }
});

// ---------------------------------------------------------------------------
// Review status is separate from lifecycle
// ---------------------------------------------------------------------------
test("review status is derived separately and is never a lifecycle state", () => {
  for (const b of DEMO_BATCHES) {
    assert.ok(!(BATCH_STATES as readonly string[]).includes(reviewStatusFor(b.state)));
  }
  const byId = (id: string) => getBatch(id)!;
  assert.equal(reviewStatusFor(byId("DEMO-002").state), "Pending verifier review");
  assert.equal(reviewStatusFor(byId("DEMO-004").state), "Awaiting resubmission");
  assert.equal(reviewStatusFor(byId("DEMO-005").state), "Review complete");
  assert.equal(reviewStatusFor(byId("DEMO-007").state), "Review complete");
  for (const id of ["DEMO-001", "DEMO-003", "DEMO-006"]) {
    assert.equal(reviewStatusFor(byId(id).state), "Not applicable");
  }
  // Only a PROCESSED_CLAIMED batch is "Pending verifier review".
  for (const b of DEMO_BATCHES) {
    assert.equal(reviewStatusFor(b.state) === "Pending verifier review", b.state === "PROCESSED_CLAIMED");
  }
});

test("review-status timeline events carry no lifecycle state and use review-status wording", () => {
  for (const b of DEMO_BATCHES) {
    for (const e of b.timeline.filter((x) => x.type === "review-status")) {
      assert.equal(e.toState, undefined, `${b.id}/${e.id} must not set toState`);
      assert.ok(REVIEW_STATUS_TITLES.includes(e.title), `${b.id}: ${e.title}`);
      assert.equal(e.title, reviewStatusFor(b.state), `${b.id}: event must match derived status`);
      assert.ok(!(BATCH_STATES as readonly string[]).includes(e.title.toUpperCase().replace(/ /g, "_")));
    }
  }
  const pending = getBatch("DEMO-002")!.timeline.filter((e) => e.type === "review-status");
  assert.equal(pending.length, 1);
});

test("canonical lifecycle and alternative outcomes are unchanged", () => {
  assert.deepEqual(
    [...CANONICAL_STAGES],
    ["REGISTERED", "COLLECTED", "RECEIVED", "PROCESSED_CLAIMED", "VERIFIED"],
  );
  assert.deepEqual([...ALTERNATIVE_OUTCOMES], ["RETURNED", "REJECTED", "CANCELLED"]);
});

// ---------------------------------------------------------------------------
// Return / rejection reasons
// ---------------------------------------------------------------------------
test("RETURNED and REJECTED batches carry a valid contract reason code; others carry none", () => {
  for (const b of DEMO_BATCHES) {
    if (b.state === "RETURNED") {
      assert.equal(b.outcome?.kind, "returned", b.id);
      assert.ok(b.outcome!.reason !== ("NONE" as string));
      assert.ok((RETURN_REASONS as readonly string[]).includes(b.outcome!.reason));
    } else if (b.state === "REJECTED") {
      assert.equal(b.outcome?.kind, "rejected", b.id);
      assert.ok(b.outcome!.reason !== ("NONE" as string));
      assert.ok((REJECT_REASONS as readonly string[]).includes(b.outcome!.reason));
    } else {
      assert.equal(b.outcome, undefined, `${b.id} must have no return/reject reason`);
    }
  }
});

test("UI reason-code lists match the Solidity ReturnReason / RejectReason enums", () => {
  const sol = read("../../contracts/LoopProofTypes.sol");
  const members = (name: string) =>
    (sol.match(new RegExp(`enum\\s+${name}\\s*\\{([^}]*)\\}`)) as RegExpMatchArray)[1]
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  assert.deepEqual([...RETURN_REASONS], members("ReturnReason"));
  assert.deepEqual([...REJECT_REASONS], members("RejectReason"));
});

// ---------------------------------------------------------------------------
// Evidence and synthetic labelling
// ---------------------------------------------------------------------------
test("evidence matches the stage reached and uses unique placeholder hashes, never real digests", () => {
  const seen = new Set<string>();
  for (const b of DEMO_BATCHES) {
    const reached = new Set(b.timeline.filter((e) => e.type === "transition").map((e) => e.toState));
    const kinds = b.evidence.map((e) => e.kind);
    assert.equal(kinds.includes("Collection record"), reached.has("COLLECTED"), `${b.id} collection`);
    assert.equal(kinds.includes("Receipt record"), reached.has("RECEIVED"), `${b.id} receipt`);
    assert.equal(kinds.includes("Processing claim"), reached.has("PROCESSED_CLAIMED"), `${b.id} claim`);

    for (const e of b.evidence) {
      assert.match(e.hashPlaceholder, /^sha256:[0-9a-f]{4}…[0-9a-f]{4}$/, `${e.id} format`);
      assert.doesNotMatch(e.hashPlaceholder, /[0-9a-f]{64}/i, `${e.id} must not look like a full digest`);
      assert.ok(!seen.has(e.hashPlaceholder), `duplicate hash ${e.hashPlaceholder}`);
      seen.add(e.hashPlaceholder);
      assert.match(e.note, /^Placeholder hash\./);
      assert.match(e.submitter, /\(demo\)$/);
      assert.ok(Date.parse(e.submittedAt) <= Date.parse(b.lastUpdated));
    }
    const ids = b.evidence.map((e) => e.id);
    assert.equal(new Set(ids).size, ids.length);
  }
});

test("all human-readable labels are marked as demo/synthetic", () => {
  assert.match(DEMO_DATA_NOTICE, /Synthetic demo data/);
  assert.match(DEMO_DATA_NOTICE, /Not connected to a backend, database, or blockchain/);
  for (const b of DEMO_BATCHES) {
    for (const label of [b.category, b.collector, b.processor, b.verifier]) {
      assert.match(label, /\(demo\)$/, `${b.id}: ${label}`);
    }
    for (const o of b.outputsGrams) assert.match(o.material, /\(demo\)$/);
    for (const e of b.timeline) assert.match(e.actor, /\(demo\)$/);
  }
  const detail = read("../app/batches/[batchId]/page.tsx");
  assert.match(detail, /DEMO_DATA_NOTICE/);
  assert.match(detail, /placeholders/);
});

test("mass data is consistent: intake only once collected; outputs only after a claim and within intake", () => {
  for (const b of DEMO_BATCHES) {
    const reached = new Set(b.timeline.filter((e) => e.type === "transition").map((e) => e.toState));
    assert.equal(b.intakeMassGrams > 0, reached.has("COLLECTED"), `${b.id} intake`);
    assert.equal(b.outputsGrams.length > 0, reached.has("PROCESSED_CLAIMED"), `${b.id} outputs`);
    const total = b.outputsGrams.reduce((s, o) => s + o.grams, 0);
    assert.ok(total <= b.intakeMassGrams, `${b.id}: outputs ${total} exceed intake ${b.intakeMassGrams}`);
  }
});

// ---------------------------------------------------------------------------
// Environmental impact gate
// ---------------------------------------------------------------------------
test("impact is unavailable for every demo batch (none has cited public factors)", () => {
  for (const b of DEMO_BATCHES) {
    assert.deepEqual(b.citedFactors, [], `${b.id} must not invent factors`);
    assert.equal(impactStatus(b).kind, "unavailable", b.id);
  }
  assert.match(impactStatus(getBatch("DEMO-005")!).reason, /no cited public factors/);
});

test("impact gate: never available before VERIFIED, even with complete evidence and factors", () => {
  const factor = { name: "Test factor", source: "Test source", url: "https://example.invalid/factor" };
  const full = [
    { kind: "Collection record" as const },
    { kind: "Receipt record" as const },
    { kind: "Processing claim" as const },
  ];
  for (const state of BATCH_STATES.filter((s) => s !== "VERIFIED")) {
    assert.equal(
      impactStatus({ state, evidence: full, citedFactors: [factor] }).kind,
      "unavailable",
      state,
    );
  }
});

test("impact gate: VERIFIED still requires complete evidence AND at least one cited factor", () => {
  const factor = { name: "F", source: "S", url: "https://example.invalid/f" };
  const full = [
    { kind: "Collection record" as const },
    { kind: "Receipt record" as const },
    { kind: "Processing claim" as const },
  ];
  assert.equal(impactStatus({ state: "VERIFIED", evidence: full, citedFactors: [] }).kind, "unavailable");
  assert.equal(
    impactStatus({ state: "VERIFIED", evidence: full.slice(0, 2), citedFactors: [factor] }).kind,
    "unavailable",
  );
  const ok = impactStatus({ state: "VERIFIED", evidence: full, citedFactors: [factor] });
  assert.equal(ok.kind, "eligible-not-implemented");
  // The gate never produces a number.
  assert.deepEqual(Object.keys(ok).sort(), ["kind", "reason"]);
});

// ---------------------------------------------------------------------------
// Unknown IDs
// ---------------------------------------------------------------------------
test("unknown, malformed, or differently-cased IDs do not resolve (page calls notFound)", () => {
  for (const bad of [
    "DEMO-000",
    "DEMO-008",
    "DEMO-999",
    "DEMO-0021",
    "demo-002",
    "DEMO-002 ",
    " DEMO-002",
    "",
    "../DEMO-002",
    "DEMO-002/evil",
    "__proto__",
    "constructor",
    "toString",
    "undefined",
    "null",
  ]) {
    assert.equal(getBatch(bad), undefined, `"${bad}" must not resolve`);
    assert.ok(!getStaticBatchIds().includes(bad));
  }
});

test("UI structure: sidebar, compact top bar, 4 summary cards, lifecycle, recent batches, and review queue exist", () => {
  const layout = read("../app/layout.tsx");
  const dashboard = read("../app/page.tsx");
  const detail = read("../app/batches/[batchId]/page.tsx");

  assert.match(layout, /className="sidebar"/);
  assert.match(layout, /className="topbar"/);
  assert.match(layout, /className="demo-banner"/);

  const kpiCards = dashboard.match(/<article className="kpi-card/g) ?? [];
  assert.equal(kpiCards.length, 4, "dashboard must render four compact summary cards");
  assert.match(dashboard, /id="lifecycle-title"/);
  assert.match(dashboard, /id="batches-title"/);
  assert.match(dashboard, /id="review-queue-title"/);

  for (const id of [
    "summary-title",
    "lifecycle-title",
    "evidence-title",
    "review-title",
    "timeline-title",
  ]) {
    assert.match(detail, new RegExp(`id="${id}"`), `detail page missing #${id}`);
  }
});

