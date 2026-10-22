import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CATEGORY_OPTIONS,
  MATERIAL_OPTIONS,
  categoryLabel,
  isValidCategoryCode,
  isValidMaterialCode,
  materialLabel,
} from "../lib/categories.ts";
import {
  LIVE_BATCH_SELECT_COLUMNS,
  LIVE_REJECT_REASONS,
  LIVE_RETURN_REASONS,
  LIVE_VERIFIER_CHECKLIST,
  cancelBatchWithRpc,
  computeEvidenceSha256Hex,
  decideBatchWithRpc,
  evidenceMatchesMimeSignature,
  formatByteaHex,
  formatDatabaseError,
  generateClaimKeyHex,
  getCurrentUserWithRoles,
  getVerifierDecisionSubmitLabel,
  hasMassDiscrepancy,
  isValidUuid,
  reconcileEvidenceState,
  recordCollectionWithRpc,
  recordReceiptWithRpc,
  registerBatchWithRpc,
  resolveBatchLifecycleAccess,
  shouldDisplayLiveOutcomeBanner,
  submitProcessingWithRpc,
  submitVerifierDecisionFormData,
  validateAndPrepareEvidence,
  validateChecklist,
  validateProcessingOutputs,
  validateRegistrationInput,
  validateVerifierDecisionReason,
  type BatchContextForValidation,
  type SupabaseLikeClient,
} from "../lib/live-batches.ts";

const VALID_REGISTRAR_ID = "11111111-1111-4111-8111-111111111111";
const VALID_COLLECTOR_ID = "22222222-2222-4222-8222-222222222222";
const VALID_PROCESSOR_ID = "33333333-3333-4333-8333-333333333333";
const VALID_VERIFIER_ID = "44444444-4444-4444-8444-444444444444";
const STRANGER_USER_ID = "55555555-5555-4555-8555-555555555555";
const CREATED_BATCH_ID = "99999999-9999-4999-8999-999999999999";
const FIXED_OBJECT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

interface MockClientOptions {
  user?: { id: string; email?: string | null } | null;
  authError?: { message: string; code?: string } | null;
  roles?: string[];
  rolesError?: { message: string; code?: string } | null;
  storageError?: { message: string; statusCode?: string } | null;
  onUpload?: (bucket: string, path: string, contentType?: string) => void;
  rpcResult?: string | null;
  rpcError?: { message: string; code?: string; details?: string } | null;
  onRpc?: (fn: string, args: Record<string, unknown>) => void;
  mockBatches?: Array<{ id: string; state: string; [key: string]: unknown }>;
  mockEvidence?: Array<{
    id: string;
    batch_id: string;
    sha256: string;
    storage_path: string;
    [key: string]: unknown;
  }>;
}

function createMockSupabaseClient(options: MockClientOptions): SupabaseLikeClient {
  return {
    auth: {
      async getUser() {
        return {
          data: { user: options.user ?? null },
          error: options.authError ?? null,
        };
      },
    },
    storage: {
      from(bucket: string) {
        return {
          async upload(
            path: string,
            _body: Uint8Array | Buffer | ArrayBuffer | Blob,
            uploadOpts?: { contentType?: string; upsert?: boolean },
          ) {
            options.onUpload?.(bucket, path, uploadOpts?.contentType);
            if (options.storageError) {
              return { data: null, error: options.storageError };
            }
            return { data: { path }, error: null };
          },
        };
      },
    },
    from(table: string) {
      return {
        select(_columns: string) {
          return {
            eq(_column: string, _value: string) {
              let resultData: unknown = [];
              let resultError: unknown = null;
              if (table === "user_roles") {
                resultData = (options.roles ?? []).map((role) => ({ role }));
                resultError = options.rolesError ?? null;
              } else if (table === "batches") {
                resultData = (options.mockBatches ?? []).filter(
                  (b) =>
                    String(b[_column] ?? "").toLowerCase() ===
                    String(_value ?? "").toLowerCase(),
                );
              } else if (table === "evidence") {
                resultData = (options.mockEvidence ?? []).filter(
                  (e) =>
                    String(e[_column] ?? "").toLowerCase() ===
                    String(_value ?? "").toLowerCase(),
                );
              }
              const promise = Promise.resolve({ data: resultData, error: resultError });
              return Object.assign(promise, {
                maybeSingle: async () => {
                  const arr = Array.isArray(resultData) ? resultData : [];
                  return { data: arr[0] ?? null, error: resultError };
                },
              });
            },
          };
        },
      };
    },
    async rpc(fn: string, args: Record<string, unknown>) {
      options.onRpc?.(fn, args);
      return {
        data: options.rpcResult ?? null,
        error: options.rpcError ?? null,
      };
    },
  };
}

function makeBatchContext(
  overrides: Partial<BatchContextForValidation> = {},
): BatchContextForValidation {
  return {
    id: CREATED_BATCH_ID,
    state: "REGISTERED",
    registrar_id: VALID_REGISTRAR_ID,
    collector_id: VALID_COLLECTOR_ID,
    processor_id: VALID_PROCESSOR_ID,
    verifier_id: VALID_VERIFIER_ID,
    intake_mass_grams: null,
    ...overrides,
  };
}


describe("Live Supabase batch registration & RLS helpers", () => {
  it("generates a cryptographically random 32-byte claim key in PostgreSQL bytea hex format", () => {
    const keyA = generateClaimKeyHex();
    const keyB = generateClaimKeyHex();

    assert.match(keyA, /^\\x[0-9a-f]{64}$/);
    assert.match(keyB, /^\\x[0-9a-f]{64}$/);
    assert.notEqual(keyA, keyB, "consecutive 32-byte random keys must never collide");
  });

  it("never selects claim_key in LIVE_BATCH_SELECT_COLUMNS", () => {
    assert.equal(
      LIVE_BATCH_SELECT_COLUMNS.includes("claim_key"),
      false,
      "LIVE_BATCH_SELECT_COLUMNS must omit claim_key to prevent secret leakage",
    );
    assert.equal(LIVE_BATCH_SELECT_COLUMNS.includes("public_ref"), true);
    assert.equal(LIVE_BATCH_SELECT_COLUMNS.includes("state"), true);
  });

  it("validates category codes and UUIDs", () => {
    assert.equal(CATEGORY_OPTIONS.length, 7);
    assert.equal(isValidCategoryCode(101), true);
    assert.equal(isValidCategoryCode(0), false);
    assert.equal(isValidCategoryCode(70000), false);
    assert.match(categoryLabel(101), /Small IT & telecommunication equipment \(#101\)/);

    assert.equal(isValidUuid(VALID_COLLECTOR_ID), true);
    assert.equal(isValidUuid("not-a-uuid"), false);
  });

  it("rejects unauthenticated access when registering a batch", async () => {
    let rpcCalled = false;
    const client = createMockSupabaseClient({
      user: null,
      onRpc: () => {
        rpcCalled = true;
      },
    });

    const result = await registerBatchWithRpc(client, {
      categoryCode: 101,
      collectorId: VALID_COLLECTOR_ID,
      processorId: VALID_PROCESSOR_ID,
      verifierId: VALID_VERIFIER_ID,
    });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, "UNAUTHENTICATED");
      assert.match(result.error, /signed in/i);
    }
    assert.equal(rpcCalled, false, "RPC must not be called when unauthenticated");
  });

  it("enforces role checks: signed-in user without registrar role is rejected", async () => {
    let rpcCalled = false;
    const client = createMockSupabaseClient({
      user: { id: VALID_COLLECTOR_ID, email: "collector@example.org" },
      roles: ["collector", "processor"],
      onRpc: () => {
        rpcCalled = true;
      },
    });

    const session = await getCurrentUserWithRoles(client);
    assert.ok(session.user);
    assert.deepEqual(session.roles, ["collector", "processor"]);

    const result = await registerBatchWithRpc(client, {
      categoryCode: 102,
      collectorId: VALID_COLLECTOR_ID,
      processorId: VALID_PROCESSOR_ID,
      verifierId: VALID_VERIFIER_ID,
    });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, "FORBIDDEN_ROLE");
      assert.match(result.error, /registrar/i);
    }
    assert.equal(rpcCalled, false, "RPC must not be called when user lacks registrar role");
  });

  it("rejects registration errors: invalid category, invalid UUID, and non-independent verifier", async () => {
    const badCategory = validateRegistrationInput({
      categoryCode: 0,
      collectorId: VALID_COLLECTOR_ID,
      processorId: VALID_PROCESSOR_ID,
      verifierId: VALID_VERIFIER_ID,
    });
    assert.equal(badCategory.ok, false);
    if (!badCategory.ok) {
      assert.equal(badCategory.code, "INVALID_CATEGORY");
    }

    const badUuid = validateRegistrationInput({
      categoryCode: 101,
      collectorId: "DEMO-001",
      processorId: VALID_PROCESSOR_ID,
      verifierId: VALID_VERIFIER_ID,
    });
    assert.equal(badUuid.ok, false);
    if (!badUuid.ok) {
      assert.equal(badUuid.code, "INVALID_UUID");
    }

    const verifierMatchesCollector = validateRegistrationInput({
      categoryCode: 101,
      collectorId: VALID_COLLECTOR_ID,
      processorId: VALID_PROCESSOR_ID,
      verifierId: VALID_COLLECTOR_ID,
    });
    assert.equal(verifierMatchesCollector.ok, false);
    if (!verifierMatchesCollector.ok) {
      assert.equal(verifierMatchesCollector.code, "VERIFIER_NOT_INDEPENDENT");
    }

    const verifierMatchesProcessor = validateRegistrationInput({
      categoryCode: 101,
      collectorId: VALID_COLLECTOR_ID,
      processorId: VALID_PROCESSOR_ID,
      verifierId: VALID_PROCESSOR_ID,
    });
    assert.equal(verifierMatchesProcessor.ok, false);
    if (!verifierMatchesProcessor.ok) {
      assert.equal(verifierMatchesProcessor.code, "VERIFIER_NOT_INDEPENDENT");
    }
  });

  it("surfaces database RPC errors clearly when an assigned user lacks a required role", async () => {
    const client = createMockSupabaseClient({
      user: { id: VALID_REGISTRAR_ID, email: "registrar@example.org" },
      roles: ["registrar"],
      rpcError: {
        code: "42501",
        message: "assignee for collector does not hold that role",
      },
    });

    const result = await registerBatchWithRpc(client, {
      categoryCode: 103,
      collectorId: VALID_COLLECTOR_ID,
      processorId: VALID_PROCESSOR_ID,
      verifierId: VALID_VERIFIER_ID,
    });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, "RPC_ERROR");
      assert.match(result.error, /assignee for collector does not hold that role/i);
    }

    assert.match(
      formatDatabaseError({
        message: "new row for relation \"batches\" violates check constraint \"batches_verifier_independent\"",
      }),
      /batches_verifier_independent/i,
    );
  });

  it("succeeds for an authenticated registrar, passes a 32-byte server claim key to lp_register_batch, and never returns the claim key", async () => {
    let capturedFn = "";
    let capturedArgs: Record<string, unknown> = {};

    const client = createMockSupabaseClient({
      user: { id: VALID_REGISTRAR_ID, email: "registrar@example.org" },
      roles: ["registrar"],
      rpcResult: CREATED_BATCH_ID,
      onRpc: (fn, args) => {
        capturedFn = fn;
        capturedArgs = args;
      },
    });

    const result = await registerBatchWithRpc(client, {
      categoryCode: 103,
      collectorId: VALID_COLLECTOR_ID.toUpperCase(),
      processorId: VALID_PROCESSOR_ID,
      verifierId: VALID_VERIFIER_ID,
    });

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.batchId, CREATED_BATCH_ID);
      assert.equal("p_claim_key" in result, false);
      assert.equal("claim_key" in result, false);
    }

    assert.equal(capturedFn, "lp_register_batch");
    assert.equal(capturedArgs.p_category_code, 103);
    assert.equal(capturedArgs.p_collector, VALID_COLLECTOR_ID);
    assert.equal(capturedArgs.p_processor, VALID_PROCESSOR_ID);
    assert.equal(capturedArgs.p_verifier, VALID_VERIFIER_ID);
    assert.match(String(capturedArgs.p_claim_key), /^\\x[0-9a-f]{64}$/);
  });

  it("formats PostgreSQL bytea hex strings and keeps live pages free of synthetic demo records", () => {
    const sampleHash = `\\x${"ab".repeat(32)}`;
    assert.equal(formatByteaHex(sampleHash), "0xabababab…abababab");

    const liveListSource = readFileSync(
      join(import.meta.dirname, "..", "app", "live-batches", "page.tsx"),
      "utf8",
    );
    const liveDetailSource = readFileSync(
      join(import.meta.dirname, "..", "app", "live-batches", "[batchId]", "page.tsx"),
      "utf8",
    );
    const liveActionsComponentSource = readFileSync(
      join(import.meta.dirname, "..", "components", "LiveLifecycleActions.tsx"),
      "utf8",
    );
    assert.doesNotMatch(liveListSource, /DEMO_BATCHES/);
    assert.doesNotMatch(liveDetailSource, /DEMO_BATCHES/);
    assert.doesNotMatch(liveActionsComponentSource, /DEMO_BATCHES/);
    assert.doesNotMatch(liveActionsComponentSource, /demo-data/);
  });
});

describe("Role/state visibility for live lifecycle actions (resolveBatchLifecycleAccess)", () => {
  it("shows Collector action only when batch is REGISTERED, user is assigned collector, and user holds collector role", () => {
    const registeredBatch = makeBatchContext({ state: "REGISTERED" });

    // Assigned collector with collector role -> allowed
    const allowed = resolveBatchLifecycleAccess(
      registeredBatch,
      { id: VALID_COLLECTOR_ID, email: "collector@example.org" },
      ["collector"],
    );
    assert.deepEqual(allowed.allowedActions, ["record_collection"]);
    assert.equal(allowed.missingRoleNotices.length, 0);

    // Assigned collector missing collector role -> blocked + missing role notice
    const missingRole = resolveBatchLifecycleAccess(
      registeredBatch,
      { id: VALID_COLLECTOR_ID, email: "collector@example.org" },
      [],
    );
    assert.deepEqual(missingRole.allowedActions, []);
    assert.equal(missingRole.missingRoleNotices.length, 1);
    assert.equal(missingRole.missingRoleNotices[0].requiredRole, "collector");

    // Different collector user (not assigned to this batch) -> blocked
    const wrongUser = resolveBatchLifecycleAccess(
      registeredBatch,
      { id: STRANGER_USER_ID, email: "other@example.org" },
      ["collector"],
    );
    assert.deepEqual(wrongUser.allowedActions, []);

    // Wrong batch state (RECEIVED) -> collector action not shown
    const wrongState = resolveBatchLifecycleAccess(
      makeBatchContext({ state: "RECEIVED", intake_mass_grams: 5000 }),
      { id: VALID_COLLECTOR_ID, email: "collector@example.org" },
      ["collector"],
    );
    assert.deepEqual(wrongState.allowedActions, []);
  });

  it("shows Processor receipt in COLLECTED, submit_processing in RECEIVED, and resubmit_processing in RETURNED only for assigned processor with role", () => {
    const collectedBatch = makeBatchContext({ state: "COLLECTED", intake_mass_grams: 8000 });
    const receivedBatch = makeBatchContext({ state: "RECEIVED", intake_mass_grams: 8000 });
    const returnedBatch = makeBatchContext({ state: "RETURNED", intake_mass_grams: 8000 });

    const receiptAccess = resolveBatchLifecycleAccess(
      collectedBatch,
      { id: VALID_PROCESSOR_ID, email: "processor@example.org" },
      ["processor"],
    );
    assert.deepEqual(receiptAccess.allowedActions, ["record_receipt"]);

    const submitAccess = resolveBatchLifecycleAccess(
      receivedBatch,
      { id: VALID_PROCESSOR_ID, email: "processor@example.org" },
      ["processor"],
    );
    assert.deepEqual(submitAccess.allowedActions, ["submit_processing"]);

    const resubmitAccess = resolveBatchLifecycleAccess(
      returnedBatch,
      { id: VALID_PROCESSOR_ID, email: "processor@example.org" },
      ["processor"],
    );
    assert.deepEqual(resubmitAccess.allowedActions, ["resubmit_processing"]);

    // Assigned processor without processor role -> blocked + missing role notice
    const missingProcRole = resolveBatchLifecycleAccess(
      receivedBatch,
      { id: VALID_PROCESSOR_ID, email: "processor@example.org" },
      ["collector"],
    );
    assert.deepEqual(missingProcRole.allowedActions, []);
    assert.equal(missingProcRole.missingRoleNotices.length, 1);
    assert.equal(missingProcRole.missingRoleNotices[0].requiredRole, "processor");

    // Processor in REGISTERED or PROCESSED_CLAIMED -> no actions
    assert.deepEqual(
      resolveBatchLifecycleAccess(
        makeBatchContext({ state: "REGISTERED" }),
        { id: VALID_PROCESSOR_ID, email: "processor@example.org" },
        ["processor"],
      ).allowedActions,
      [],
    );
    assert.deepEqual(
      resolveBatchLifecycleAccess(
        makeBatchContext({ state: "PROCESSED_CLAIMED", intake_mass_grams: 8000 }),
        { id: VALID_PROCESSOR_ID, email: "processor@example.org" },
        ["processor"],
      ).allowedActions,
      [],
    );
  });

  it("shows Verifier decision controls only in PROCESSED_CLAIMED for assigned independent verifier with verifier role", () => {
    const claimedBatch = makeBatchContext({
      state: "PROCESSED_CLAIMED",
      intake_mass_grams: 8000,
    });

    const verifierAccess = resolveBatchLifecycleAccess(
      claimedBatch,
      { id: VALID_VERIFIER_ID, email: "verifier@example.org" },
      ["verifier"],
    );
    assert.deepEqual(verifierAccess.allowedActions, ["verifier_decision"]);
    assert.equal(verifierAccess.independenceViolation, undefined);

    // Assigned verifier lacking verifier role -> blocked + missing role warning
    const missingVerifierRole = resolveBatchLifecycleAccess(
      claimedBatch,
      { id: VALID_VERIFIER_ID, email: "verifier@example.org" },
      [],
    );
    assert.deepEqual(missingVerifierRole.allowedActions, []);
    assert.equal(missingVerifierRole.missingRoleNotices.length, 1);
    assert.equal(missingVerifierRole.missingRoleNotices[0].requiredRole, "verifier");

    // Non-independent verifier (verifier == processor) -> blocked with independence violation
    const conflictedBatch = makeBatchContext({
      state: "PROCESSED_CLAIMED",
      verifier_id: VALID_PROCESSOR_ID,
      intake_mass_grams: 8000,
    });
    const conflictedAccess = resolveBatchLifecycleAccess(
      conflictedBatch,
      { id: VALID_PROCESSOR_ID, email: "processor@example.org" },
      ["processor", "verifier"],
    );
    assert.deepEqual(conflictedAccess.allowedActions, []);
    assert.match(conflictedAccess.independenceViolation ?? "", /Verifier independence violation/i);

    // Terminal states -> never show actions
    for (const terminalState of ["VERIFIED", "REJECTED", "CANCELLED"] as const) {
      const termAccess = resolveBatchLifecycleAccess(
        makeBatchContext({ state: terminalState, intake_mass_grams: 8000 }),
        { id: VALID_VERIFIER_ID, email: "verifier@example.org" },
        ["registrar", "collector", "processor", "verifier"],
      );
      assert.deepEqual(termAccess.allowedActions, []);
    }
  });
});

describe("Lifecycle RPC helpers: Collector, Processor, Verifier, and Registrar", () => {
  const samplePdfBytes = new TextEncoder().encode("%PDF-1.7 sample evidence content");
  const samplePngBytes = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  ]);
  const sampleJpegBytes = new Uint8Array([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00,
  ]);

  it("validates evidence files, MIME types, and SHA-256 digests", () => {
    // File signature verification
    assert.equal(evidenceMatchesMimeSignature(samplePdfBytes, "application/pdf"), true);
    assert.equal(evidenceMatchesMimeSignature(samplePngBytes, "image/png"), true);
    assert.equal(evidenceMatchesMimeSignature(sampleJpegBytes, "image/jpeg"), true);
    assert.equal(evidenceMatchesMimeSignature(samplePdfBytes, "image/png"), false);
    assert.equal(evidenceMatchesMimeSignature(samplePngBytes, "application/pdf"), false);
    assert.equal(evidenceMatchesMimeSignature(sampleJpegBytes, "application/pdf"), false);
    assert.equal(evidenceMatchesMimeSignature(new Uint8Array([1, 2, 3]), "image/jpeg"), false);
    assert.equal(evidenceMatchesMimeSignature(new Uint8Array(0), "application/pdf"), false);
    assert.equal(evidenceMatchesMimeSignature(samplePdfBytes, "application/json"), false);

    assert.equal(MATERIAL_OPTIONS.length >= 8, true);
    assert.equal(isValidMaterialCode(201), true);
    assert.equal(isValidMaterialCode(0), false);
    assert.match(materialLabel(201), /Copper & copper-alloy fraction \(#201\)/);

    const sha = computeEvidenceSha256Hex(samplePdfBytes);
    assert.match(sha, /^\\x[0-9a-f]{64}$/);

    const emptyRes = validateAndPrepareEvidence(
      CREATED_BATCH_ID,
      { bytes: new Uint8Array(0), mimeType: "application/pdf" },
      () => FIXED_OBJECT_ID,
    );
    assert.equal(emptyRes.ok, false);
    if (!emptyRes.ok) assert.equal(emptyRes.code, "INVALID_EVIDENCE");

    const badMimeRes = validateAndPrepareEvidence(
      CREATED_BATCH_ID,
      { bytes: samplePdfBytes, mimeType: "text/plain" },
      () => FIXED_OBJECT_ID,
    );
    assert.equal(badMimeRes.ok, false);
    if (!badMimeRes.ok) assert.equal(badMimeRes.code, "INVALID_EVIDENCE");

    // Spoofed content (content does not match declared MIME)
    const spoofedRes = validateAndPrepareEvidence(
      CREATED_BATCH_ID,
      { bytes: new TextEncoder().encode("not a real PDF file"), mimeType: "application/pdf" },
      () => FIXED_OBJECT_ID,
    );
    assert.equal(spoofedRes.ok, false);
    if (!spoofedRes.ok) {
      assert.equal(spoofedRes.code, "INVALID_EVIDENCE");
      assert.match(spoofedRes.error, /does not match its declared/i);
    }

    const validRes = validateAndPrepareEvidence(
      CREATED_BATCH_ID,
      { bytes: samplePdfBytes, mimeType: "application/pdf" },
      () => FIXED_OBJECT_ID,
    );
    assert.equal(validRes.ok, true);
    if (validRes.ok) {
      assert.equal(validRes.prepared.storagePath, `${CREATED_BATCH_ID}/${FIXED_OBJECT_ID}`);
      assert.equal(validRes.prepared.byteSize, samplePdfBytes.byteLength);
      assert.equal(validRes.prepared.mimeType, "application/pdf");
      assert.equal(validRes.prepared.sha256Hex, sha);
    }

    const validPngRes = validateAndPrepareEvidence(
      CREATED_BATCH_ID,
      { bytes: samplePngBytes, mimeType: "image/png" },
      () => FIXED_OBJECT_ID,
    );
    assert.equal(validPngRes.ok, true);
  });

  it("Collector: uploads evidence and calls public.lp_record_collection with intake mass and SHA-256", async () => {
    let uploadedBucket = "";
    let uploadedPath = "";
    let rpcFn = "";
    let rpcArgs: Record<string, unknown> = {};

    const client = createMockSupabaseClient({
      user: { id: VALID_COLLECTOR_ID, email: "collector@example.org" },
      roles: ["collector"],
      onUpload: (bucket, path) => {
        uploadedBucket = bucket;
        uploadedPath = path;
      },
      onRpc: (fn, args) => {
        rpcFn = fn;
        rpcArgs = args;
      },
    });

    const res = await recordCollectionWithRpc(
      client,
      {
        batchId: CREATED_BATCH_ID,
        intakeMassGrams: 12500,
        evidence: { bytes: samplePdfBytes, mimeType: "application/pdf" },
        batch: makeBatchContext({ state: "REGISTERED" }),
      },
      () => FIXED_OBJECT_ID,
    );

    assert.equal(res.ok, true);
    if (res.ok) {
      assert.equal(res.nextState, "COLLECTED");
      assert.equal(res.storagePath, `${CREATED_BATCH_ID}/${FIXED_OBJECT_ID}`);
    }
    assert.equal(uploadedBucket, "evidence");
    assert.equal(uploadedPath, `${CREATED_BATCH_ID}/${FIXED_OBJECT_ID}`);
    assert.equal(rpcFn, "lp_record_collection");
    assert.equal(rpcArgs.p_batch_id, CREATED_BATCH_ID);
    assert.equal(rpcArgs.p_intake_mass_grams, 12500);
    assert.equal(rpcArgs.p_storage_path, `${CREATED_BATCH_ID}/${FIXED_OBJECT_ID}`);
    assert.equal(rpcArgs.p_byte_size, samplePdfBytes.byteLength);
    assert.equal(rpcArgs.p_mime_type, "application/pdf");
    assert.match(String(rpcArgs.p_sha256), /^\\x[0-9a-f]{64}$/);
  });

  it("Collector: rejects invalid intake mass, missing role, wrong state, storage error, and RPC error", async () => {
    let uploadAttempts = 0;
    const client = createMockSupabaseClient({
      user: { id: VALID_COLLECTOR_ID, email: "collector@example.org" },
      roles: ["collector"],
      onUpload: () => {
        uploadAttempts++;
      },
    });

    const badMass = await recordCollectionWithRpc(client, {
      batchId: CREATED_BATCH_ID,
      intakeMassGrams: 0,
      evidence: { bytes: samplePdfBytes, mimeType: "application/pdf" },
      batch: makeBatchContext({ state: "REGISTERED" }),
    });
    assert.equal(badMass.ok, false);
    if (!badMass.ok) assert.equal(badMass.code, "INVALID_INTAKE_MASS");
    assert.equal(uploadAttempts, 0);

    const wrongState = await recordCollectionWithRpc(client, {
      batchId: CREATED_BATCH_ID,
      intakeMassGrams: 5000,
      evidence: { bytes: samplePdfBytes, mimeType: "application/pdf" },
      batch: makeBatchContext({ state: "RECEIVED", intake_mass_grams: 5000 }),
    });
    assert.equal(wrongState.ok, false);
    if (!wrongState.ok) assert.equal(wrongState.code, "INVALID_STATE");
    assert.equal(uploadAttempts, 0);

    const storageFailClient = createMockSupabaseClient({
      user: { id: VALID_COLLECTOR_ID, email: "collector@example.org" },
      roles: ["collector"],
      storageError: { message: "new row violates row-level security policy" },
    });
    const storageFail = await recordCollectionWithRpc(
      storageFailClient,
      {
        batchId: CREATED_BATCH_ID,
        intakeMassGrams: 5000,
        evidence: { bytes: samplePdfBytes, mimeType: "application/pdf" },
      },
      () => FIXED_OBJECT_ID,
    );
    assert.equal(storageFail.ok, false);
    if (!storageFail.ok) {
      assert.equal(storageFail.code, "STORAGE_ERROR");
      assert.match(storageFail.error, /evidence_files_insert_actor/i);
    }

    const rpcFailClient = createMockSupabaseClient({
      user: { id: VALID_COLLECTOR_ID, email: "collector@example.org" },
      roles: ["collector"],
      rpcError: {
        code: "42501",
        message: "caller is not the collector assigned to this batch",
      },
    });
    const rpcFail = await recordCollectionWithRpc(
      rpcFailClient,
      {
        batchId: CREATED_BATCH_ID,
        intakeMassGrams: 5000,
        evidence: { bytes: samplePdfBytes, mimeType: "application/pdf" },
      },
      () => FIXED_OBJECT_ID,
    );
    assert.equal(rpcFail.ok, false);
    if (!rpcFail.ok) {
      assert.equal(rpcFail.code, "RPC_ERROR");
      assert.match(rpcFail.error, /caller is not the collector assigned to this batch/i);
    }
  });

  it("Processor: records receipt in COLLECTED via public.lp_record_receipt and submits/resubmits processing claims with mass-balance checks", async () => {
    const calls: Array<{ fn: string; args: Record<string, unknown> }> = [];
    const client = createMockSupabaseClient({
      user: { id: VALID_PROCESSOR_ID, email: "processor@example.org" },
      roles: ["processor"],
      onRpc: (fn, args) => {
        calls.push({ fn, args });
      },
    });

    // 1. Record receipt (COLLECTED -> RECEIVED)
    const receiptRes = await recordReceiptWithRpc(
      client,
      {
        batchId: CREATED_BATCH_ID,
        evidence: { bytes: samplePngBytes, mimeType: "image/png" },
        batch: makeBatchContext({ state: "COLLECTED", intake_mass_grams: 10000 }),
      },
      () => FIXED_OBJECT_ID,
    );
    assert.equal(receiptRes.ok, true);
    if (receiptRes.ok) assert.equal(receiptRes.nextState, "RECEIVED");
    assert.equal(calls[0].fn, "lp_record_receipt");

    // 2. Submit processing claim (RECEIVED -> PROCESSED_CLAIMED)
    const submitRes = await submitProcessingWithRpc(
      client,
      {
        batchId: CREATED_BATCH_ID,
        mode: "submit",
        intakeMassGrams: 10000,
        outputs: [
          { material_code: 201, mass_grams: 6000 },
          { material_code: 204, mass_grams: 3200 },
        ],
        evidence: { bytes: samplePdfBytes, mimeType: "application/pdf" },
        batch: makeBatchContext({ state: "RECEIVED", intake_mass_grams: 10000 }),
      },
      () => FIXED_OBJECT_ID,
    );
    assert.equal(submitRes.ok, true);
    if (submitRes.ok) {
      assert.equal(submitRes.nextState, "PROCESSED_CLAIMED");
      assert.equal(submitRes.totalOutputGrams, 9200);
    }
    assert.equal(calls[1].fn, "lp_submit_processing");
    assert.deepEqual(calls[1].args.p_outputs, [
      { material_code: 201, mass_grams: 6000 },
      { material_code: 204, mass_grams: 3200 },
    ]);

    // 3. Resubmit processing claim (RETURNED -> PROCESSED_CLAIMED)
    const resubmitRes = await submitProcessingWithRpc(
      client,
      {
        batchId: CREATED_BATCH_ID,
        mode: "resubmit",
        intakeMassGrams: 10000,
        outputs: [{ material_code: 201, mass_grams: 8500 }],
        evidence: { bytes: samplePdfBytes, mimeType: "application/pdf" },
        batch: makeBatchContext({ state: "RETURNED", intake_mass_grams: 10000 }),
      },
      () => FIXED_OBJECT_ID,
    );
    assert.equal(resubmitRes.ok, true);
    assert.equal(calls[2].fn, "lp_resubmit_processing");
  });

  it("Processor: enforces mass-balance rule, output bounds (1..16), and surfaces duplicate evidence hash RPC errors", async () => {
    // Mass-balance violation: 6000 + 4001 = 10001 > 10000 intake
    const overIntake = validateProcessingOutputs(
      [
        { material_code: 201, mass_grams: 6000 },
        { material_code: 202, mass_grams: 4001 },
      ],
      10000,
    );
    assert.equal(overIntake.ok, false);
    if (!overIntake.ok) {
      assert.equal(overIntake.code, "MASS_BALANCE_EXCEEDED");
      assert.match(overIntake.error, /Mass balance exceeded/i);
    }

    // Empty outputs array
    const emptyOutputs = validateProcessingOutputs([], 10000);
    assert.equal(emptyOutputs.ok, false);
    if (!emptyOutputs.ok) assert.equal(emptyOutputs.code, "INVALID_OUTPUTS");

    // Pre-upload output check prevents orphaned storage objects
    let uploadAttempts = 0;
    const preUploadCheckClient = createMockSupabaseClient({
      user: { id: VALID_PROCESSOR_ID, email: "processor@example.org" },
      roles: ["processor"],
      onUpload: () => {
        uploadAttempts++;
      },
    });
    const badOutputsRes = await submitProcessingWithRpc(
      preUploadCheckClient,
      {
        batchId: CREATED_BATCH_ID,
        mode: "submit",
        intakeMassGrams: 10000,
        outputs: [
          { material_code: 201, mass_grams: 6000 },
          { material_code: 202, mass_grams: 5000 },
        ],
        evidence: { bytes: samplePdfBytes, mimeType: "application/pdf" },
        batch: makeBatchContext({ state: "RECEIVED", intake_mass_grams: 10000 }),
      },
      () => FIXED_OBJECT_ID,
    );
    assert.equal(badOutputsRes.ok, false);
    if (!badOutputsRes.ok) assert.equal(badOutputsRes.code, "MASS_BALANCE_EXCEEDED");
    assert.equal(uploadAttempts, 0);

    // Duplicate evidence SHA-256 hash rejected by database
    const dupHashClient = createMockSupabaseClient({
      user: { id: VALID_PROCESSOR_ID, email: "processor@example.org" },
      roles: ["processor"],
      rpcError: {
        code: "23505",
        message: 'duplicate key value violates unique constraint "evidence_sha256_key"',
      },
    });
    const dupRes = await submitProcessingWithRpc(
      dupHashClient,
      {
        batchId: CREATED_BATCH_ID,
        mode: "submit",
        intakeMassGrams: 10000,
        outputs: [{ material_code: 201, mass_grams: 5000 }],
        evidence: { bytes: samplePdfBytes, mimeType: "application/pdf" },
        batch: makeBatchContext({ state: "RECEIVED", intake_mass_grams: 10000 }),
      },
      () => FIXED_OBJECT_ID,
    );
    assert.equal(dupRes.ok, false);
    if (!dupRes.ok) {
      assert.equal(dupRes.code, "RPC_ERROR");
      assert.match(dupRes.error, /Duplicate evidence SHA-256 hash rejected/i);
    }
  });

  it("Verifier: executes lp_verify_batch, lp_return_batch, and lp_reject_batch with checklist and reason codes, and enforces independence", async () => {
    const calls: Array<{ fn: string; args: Record<string, unknown> }> = [];
    const client = createMockSupabaseClient({
      user: { id: VALID_VERIFIER_ID, email: "verifier@example.org" },
      roles: ["verifier"],
      onRpc: (fn, args) => {
        calls.push({ fn, args });
      },
    });

    const checklistObj = Object.fromEntries(
      LIVE_VERIFIER_CHECKLIST.map((item) => [item.key, true]),
    );
    const claimedBatch = makeBatchContext({
      state: "PROCESSED_CLAIMED",
      intake_mass_grams: 10000,
    });

    // 1. Approve / Verify
    const verifyRes = await decideBatchWithRpc(client, {
      batchId: CREATED_BATCH_ID,
      decision: "verified",
      checklist: checklistObj,
      batch: claimedBatch,
    });
    assert.equal(verifyRes.ok, true);
    if (verifyRes.ok) assert.equal(verifyRes.nextState, "VERIFIED");
    assert.equal(calls[0].fn, "lp_verify_batch");
    assert.deepEqual(calls[0].args.p_checklist, checklistObj);

    // 2. Return for more evidence
    const returnRes = await decideBatchWithRpc(client, {
      batchId: CREATED_BATCH_ID,
      decision: "returned",
      returnReason: "INSUFFICIENT_EVIDENCE",
      checklist: { ...checklistObj, files_opened_and_matched: false },
      batch: claimedBatch,
    });
    assert.equal(returnRes.ok, true);
    if (returnRes.ok) assert.equal(returnRes.nextState, "RETURNED");
    assert.equal(calls[1].fn, "lp_return_batch");
    assert.equal(calls[1].args.p_reason, "INSUFFICIENT_EVIDENCE");

    // 3. Reject permanently
    const rejectRes = await decideBatchWithRpc(client, {
      batchId: CREATED_BATCH_ID,
      decision: "rejected",
      rejectReason: "MASS_BALANCE_IMPLAUSIBLE",
      checklist: { ...checklistObj, mass_balance_within_intake: false },
      batch: claimedBatch,
    });
    assert.equal(rejectRes.ok, true);
    if (rejectRes.ok) assert.equal(rejectRes.nextState, "REJECTED");
    assert.equal(calls[2].fn, "lp_reject_batch");
    assert.equal(calls[2].args.p_reason, "MASS_BALANCE_IMPLAUSIBLE");

    // 4. Rejects missing return/reject reason
    const badReturn = await decideBatchWithRpc(client, {
      batchId: CREATED_BATCH_ID,
      decision: "returned",
      returnReason: "",
      checklist: checklistObj,
      batch: claimedBatch,
    });
    assert.equal(badReturn.ok, false);
    if (!badReturn.ok) assert.equal(badReturn.code, "INVALID_REASON");

    // 5. Enforces independent-verifier rule (verifier cannot be processor or collector)
    const selfVerifyClient = createMockSupabaseClient({
      user: { id: VALID_PROCESSOR_ID, email: "processor@example.org" },
      roles: ["processor", "verifier"],
    });
    const selfVerifyRes = await decideBatchWithRpc(selfVerifyClient, {
      batchId: CREATED_BATCH_ID,
      decision: "verified",
      checklist: checklistObj,
      collectorId: VALID_COLLECTOR_ID,
      processorId: VALID_PROCESSOR_ID,
    });
    assert.equal(selfVerifyRes.ok, false);
    if (!selfVerifyRes.ok) assert.equal(selfVerifyRes.code, "VERIFIER_NOT_INDEPENDENT");

    // 6. Validates checklist constraints (max 20 boolean items)
    const badChecklist = validateChecklist({ invalid_item: "not-a-boolean" });
    assert.equal(badChecklist.ok, false);
  });

  it("Verifier decision form & server action FormData handler: supports verified, returned (all 4 enum codes), and rejected (all 4 enum codes)", async () => {
    // 1. Exact submit button labels for each decision
    assert.equal(
      getVerifierDecisionSubmitLabel("verified"),
      "Approve & Verify Claim (VERIFIED)",
    );
    assert.equal(
      getVerifierDecisionSubmitLabel("returned"),
      "Return for More Evidence (RETURNED)",
    );
    assert.equal(
      getVerifierDecisionSubmitLabel("rejected"),
      "Reject Claim (REJECTED)",
    );

    // 2. Exact database enum lists match migration
    assert.deepEqual(LIVE_RETURN_REASONS, [
      "INSUFFICIENT_EVIDENCE",
      "EVIDENCE_UNREADABLE",
      "OUTPUT_DATA_INCOMPLETE",
      "MASS_DISCREPANCY",
    ]);
    assert.deepEqual(LIVE_REJECT_REASONS, [
      "EVIDENCE_INCONSISTENT",
      "MASS_BALANCE_IMPLAUSIBLE",
      "PROCESSOR_NOT_QUALIFIED",
      "CHAIN_OF_CUSTODY_BROKEN",
    ]);

    // 3. Pre-submission reason validation (validateVerifierDecisionReason)
    const validApprove = validateVerifierDecisionReason("verified", "INSUFFICIENT_EVIDENCE", "EVIDENCE_INCONSISTENT");
    assert.equal(validApprove.ok, true);
    if (validApprove.ok) {
      assert.equal(validApprove.decision, "verified");
      assert.equal(validApprove.returnReason, null);
      assert.equal(validApprove.rejectReason, null);
    }

    const missingReturn = validateVerifierDecisionReason("returned", "");
    assert.equal(missingReturn.ok, false);
    if (!missingReturn.ok) {
      assert.equal(missingReturn.code, "INVALID_REASON");
      assert.match(missingReturn.error, /Return reason is required/i);
    }

    const missingReject = validateVerifierDecisionReason("rejected", null, "");
    assert.equal(missingReject.ok, false);
    if (!missingReject.ok) {
      assert.equal(missingReject.code, "INVALID_REASON");
      assert.match(missingReject.error, /Reject reason is required/i);
    }

    // 4. Server action FormData dispatch for all three decisions and all reason codes
    const calls: Array<{ fn: string; args: Record<string, unknown> }> = [];
    const client = createMockSupabaseClient({
      user: { id: VALID_VERIFIER_ID, email: "verifier@example.org" },
      roles: ["verifier"],
      onRpc: (fn, args) => {
        calls.push({ fn, args });
      },
    });
    const checklistObj = Object.fromEntries(
      LIVE_VERIFIER_CHECKLIST.map((item) => [item.key, true]),
    );
    const claimedBatch = makeBatchContext({
      state: "PROCESSED_CLAIMED",
      intake_mass_grams: 10000,
    });

    // 4a. Approve (verified) does NOT pass p_reason even if returnReason is present in FormData
    const approveForm = new FormData();
    approveForm.set("batchId", CREATED_BATCH_ID);
    approveForm.set("decision", "verified");
    approveForm.set("checklistJson", JSON.stringify(checklistObj));
    const approveActionRes = await submitVerifierDecisionFormData(client, approveForm, claimedBatch);
    assert.equal(approveActionRes.status, "success");
    assert.equal(approveActionRes.nextState, "VERIFIED");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].fn, "lp_verify_batch");
    assert.equal("p_reason" in calls[0].args, false);
    assert.deepEqual(calls[0].args.p_checklist, checklistObj);

    // 4b. Return for More Evidence (returned) passes each of the 4 valid return_reason codes in p_reason
    for (const reasonCode of LIVE_RETURN_REASONS) {
      const returnForm = new FormData();
      returnForm.set("batchId", CREATED_BATCH_ID);
      returnForm.set("decision", "returned");
      returnForm.set("returnReason", reasonCode);
      returnForm.set("checklistJson", JSON.stringify(checklistObj));

      const res = await submitVerifierDecisionFormData(client, returnForm, claimedBatch);
      assert.equal(res.status, "success");
      assert.equal(res.nextState, "RETURNED");
      const lastCall = calls[calls.length - 1];
      assert.equal(lastCall.fn, "lp_return_batch");
      assert.equal(lastCall.args.p_reason, reasonCode);
    }

    // 4c. Reject Claim (rejected) passes each of the 4 valid reject_reason codes in p_reason
    for (const reasonCode of LIVE_REJECT_REASONS) {
      const rejectForm = new FormData();
      rejectForm.set("batchId", CREATED_BATCH_ID);
      rejectForm.set("decision", "rejected");
      rejectForm.set("rejectReason", reasonCode);
      rejectForm.set("checklistJson", JSON.stringify(checklistObj));

      const res = await submitVerifierDecisionFormData(client, rejectForm, claimedBatch);
      assert.equal(res.status, "success");
      assert.equal(res.nextState, "REJECTED");
      const lastCall = calls[calls.length - 1];
      assert.equal(lastCall.fn, "lp_reject_batch");
      assert.equal(lastCall.args.p_reason, reasonCode);
    }

    // 4d. Missing returnReason or rejectReason in FormData fails before calling RPC
    const callCountBeforeBad = calls.length;
    const badReturnForm = new FormData();
    badReturnForm.set("batchId", CREATED_BATCH_ID);
    badReturnForm.set("decision", "returned");
    badReturnForm.set("checklistJson", JSON.stringify(checklistObj));
    const badReturnRes = await submitVerifierDecisionFormData(client, badReturnForm, claimedBatch);
    assert.equal(badReturnRes.status, "error");
    assert.equal(badReturnRes.code, "INVALID_REASON");
    assert.equal(calls.length, callCountBeforeBad);

    const badRejectForm = new FormData();
    badRejectForm.set("batchId", CREATED_BATCH_ID);
    badRejectForm.set("decision", "rejected");
    badRejectForm.set("checklistJson", JSON.stringify(checklistObj));
    const badRejectRes = await submitVerifierDecisionFormData(client, badRejectForm, claimedBatch);
    assert.equal(badRejectRes.status, "error");
    assert.equal(badRejectRes.code, "INVALID_REASON");
    assert.equal(calls.length, callCountBeforeBad);

    // 5. Verify UI source in LiveLifecycleActions.tsx has controlled selectors and pre-submit validation
    const uiSource = readFileSync(
      join(import.meta.dirname, "../components/LiveLifecycleActions.tsx"),
      "utf8",
    );
    assert.match(uiSource, /decision === "returned"\s*\?[\s\S]*?name="returnReason"/);
    assert.match(uiSource, /decision === "rejected"\s*\?[\s\S]*?name="rejectReason"/);
    assert.match(uiSource, /getVerifierDecisionSubmitLabel\(decision\)/);
    assert.match(uiSource, /validateVerifierDecisionReason\(decision,\s*returnReason,\s*rejectReason/);
  });

  it("Regression (LP-000001 Revision 4): rejects MASS_DISCREPANCY return when claimed output equals intake (0 g unaccounted) and hides stale return banner on newer revisions", async () => {
    const calls: Array<{ fn: string; args: Record<string, unknown> }> = [];
    const client = createMockSupabaseClient({
      user: { id: VALID_VERIFIER_ID, email: "verifier@example.org" },
      roles: ["verifier"],
      onRpc: (fn, args) => {
        calls.push({ fn, args });
      },
    });
    const checklistObj = Object.fromEntries(
      LIVE_VERIFIER_CHECKLIST.map((item) => [item.key, true]),
    );

    // Revision 4 outputs: 7,000 g + 3,000 g = 10,000 g against 10,000 g intake (0 g unaccounted)
    const rev4OutputsCheck = validateProcessingOutputs(
      [
        { material_code: 101, mass_grams: 7000 },
        { material_code: 201, mass_grams: 3000 },
      ],
      10000,
    );
    assert.equal(rev4OutputsCheck.ok, true);
    if (rev4OutputsCheck.ok) {
      assert.equal(rev4OutputsCheck.totalOutputGrams, 10000);
    }

    assert.equal(
      hasMassDiscrepancy({ intakeMassGrams: 10000, claimedOutputGrams: 10000 }),
      false,
    );
    assert.equal(
      hasMassDiscrepancy({ intakeMassGrams: 10000, claimedOutputGrams: 7000 }),
      true,
    );

    const rev4Batch = {
      ...makeBatchContext({ state: "PROCESSED_CLAIMED", intake_mass_grams: 10000 }),
      current_revision: 4,
      claimed_output_grams: 10000,
    };

    // 1. Returning Revision 4 with MASS_DISCREPANCY is rejected before calling lp_return_batch
    const badMassReturnForm = new FormData();
    badMassReturnForm.set("batchId", CREATED_BATCH_ID);
    badMassReturnForm.set("decision", "returned");
    badMassReturnForm.set("returnReason", "MASS_DISCREPANCY");
    badMassReturnForm.set("checklistJson", JSON.stringify(checklistObj));

    const badMassRes = await submitVerifierDecisionFormData(
      client,
      badMassReturnForm,
      rev4Batch,
    );
    assert.equal(badMassRes.status, "error");
    assert.equal(badMassRes.code, "INVALID_REASON");
    assert.match(badMassRes.message, /0 g unaccounted mass/i);
    assert.equal(calls.length, 0);

    // 2. Legitimate non-mass return reasons (e.g. INSUFFICIENT_EVIDENCE) still work on Revision 4
    const validEvidenceReturnForm = new FormData();
    validEvidenceReturnForm.set("batchId", CREATED_BATCH_ID);
    validEvidenceReturnForm.set("decision", "returned");
    validEvidenceReturnForm.set("returnReason", "INSUFFICIENT_EVIDENCE");
    validEvidenceReturnForm.set("checklistJson", JSON.stringify(checklistObj));

    const validEvidenceReturnRes = await submitVerifierDecisionFormData(
      client,
      validEvidenceReturnForm,
      rev4Batch,
    );
    assert.equal(validEvidenceReturnRes.status, "success");
    assert.equal(validEvidenceReturnRes.nextState, "RETURNED");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].fn, "lp_return_batch");
    assert.equal(calls[0].args.p_reason, "INSUFFICIENT_EVIDENCE");

    // 3. When a genuine mass discrepancy exists (e.g. Revision 3 had 7,000 g vs 10,000 g intake), MASS_DISCREPANCY is allowed
    const rev3BatchWithDiscrepancy = {
      ...makeBatchContext({ state: "PROCESSED_CLAIMED", intake_mass_grams: 10000 }),
      current_revision: 3,
      claimed_output_grams: 7000,
    };
    const validMassReturnRes = await submitVerifierDecisionFormData(
      client,
      badMassReturnForm,
      rev3BatchWithDiscrepancy,
    );
    assert.equal(validMassReturnRes.status, "success");
    assert.equal(validMassReturnRes.nextState, "RETURNED");
    assert.equal(calls.length, 2);
    assert.equal(calls[1].fn, "lp_return_batch");
    assert.equal(calls[1].args.p_reason, "MASS_DISCREPANCY");

    // 4. Stale Revision 3 RETURNED (MASS_DISCREPANCY) outcome banner is NOT displayed when Revision 4 is PROCESSED_CLAIMED or VERIFIED
    const rev3Decision = {
      revision: 3,
      decision: "returned" as const,
      return_reason: "MASS_DISCREPANCY" as const,
      reject_reason: null,
    };
    assert.equal(shouldDisplayLiveOutcomeBanner("RETURNED", 3, rev3Decision), true);
    assert.equal(shouldDisplayLiveOutcomeBanner("PROCESSED_CLAIMED", 4, rev3Decision), false);
    assert.equal(shouldDisplayLiveOutcomeBanner("VERIFIED", 4, rev3Decision), false);

    // 5. Verify forward-only Supabase migration structure and SQL guard
    const baseMigrationSql = readFileSync(
      join(import.meta.dirname, "../../supabase/migrations/20261020000000_loopproof_core_schema.sql"),
      "utf8",
    );
    const guardMigrationSql = readFileSync(
      join(import.meta.dirname, "../../supabase/migrations/20261021000000_verifier_mass_discrepancy_guard.sql"),
      "utf8",
    );
    assert.equal(
      baseMigrationSql.includes("cannot return with MASS_DISCREPANCY when total_output_grams"),
      false,
      "already-applied baseline migration 20261020000000 must not be edited",
    );
    assert.match(
      guardMigrationSql,
      /create or replace function private\.decide\(/i,
    );
    assert.match(
      guardMigrationSql,
      /if p_decision = 'returned' and p_return = 'MASS_DISCREPANCY' and v_total = b\.intake_mass_grams then/i,
    );
    assert.match(
      guardMigrationSql,
      /revoke all on function private\.decide\([\s\S]*?from public, anon, authenticated;/i,
    );
  });

  it("Registrar: cancels a REGISTERED batch before collection via public.lp_cancel_batch and rejects post-collection cancellation", async () => {
    let calledFn = "";
    const client = createMockSupabaseClient({
      user: { id: VALID_REGISTRAR_ID, email: "registrar@example.org" },
      roles: ["registrar"],
      onRpc: (fn) => {
        calledFn = fn;
      },
    });

    const cancelOk = await cancelBatchWithRpc(client, {
      batchId: CREATED_BATCH_ID,
      batch: makeBatchContext({ state: "REGISTERED" }),
    });
    assert.equal(cancelOk.ok, true);
    if (cancelOk.ok) assert.equal(cancelOk.nextState, "CANCELLED");
    assert.equal(calledFn, "lp_cancel_batch");

    const cancelAfterCollection = await cancelBatchWithRpc(client, {
      batchId: CREATED_BATCH_ID,
      batch: makeBatchContext({ state: "COLLECTED", intake_mass_grams: 4000 }),
    });
    assert.equal(cancelAfterCollection.ok, false);
    if (!cancelAfterCollection.ok) assert.equal(cancelAfterCollection.code, "INVALID_STATE");
  });

  it("idempotently reconciles lifecycle state on ambiguous network timeouts or retry submissions", async () => {
    const testPdfSha = computeEvidenceSha256Hex(samplePdfBytes);
    const fixedStoragePath = `${CREATED_BATCH_ID}/${FIXED_OBJECT_ID}`;

    // 1. Database RPC fails with ambiguous error / timeout, but transaction actually committed
    const committedClient = createMockSupabaseClient({
      user: { id: VALID_COLLECTOR_ID, email: "collector@example.org" },
      roles: ["collector"],
      rpcError: { code: "55000", message: "invalid transition from COLLECTED" },
      mockBatches: [{ id: CREATED_BATCH_ID, state: "COLLECTED" }],
      mockEvidence: [
        {
          id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
          batch_id: CREATED_BATCH_ID,
          sha256: testPdfSha,
          storage_path: fixedStoragePath,
        },
      ],
    });

    const reconciledRes = await recordCollectionWithRpc(
      committedClient,
      {
        batchId: CREATED_BATCH_ID,
        intakeMassGrams: 5000,
        evidence: { bytes: samplePdfBytes, mimeType: "application/pdf" },
      },
      () => FIXED_OBJECT_ID,
    );
    assert.equal(reconciledRes.ok, true);
    if (reconciledRes.ok) {
      assert.equal(reconciledRes.nextState, "COLLECTED");
      assert.equal(reconciledRes.sha256Hex, testPdfSha);
      assert.equal(reconciledRes.storagePath, fixedStoragePath);
    }

    // 2. Storage upload fails on retry because object already exists, but batch is already COLLECTED
    const storageRetryClient = createMockSupabaseClient({
      user: { id: VALID_COLLECTOR_ID, email: "collector@example.org" },
      roles: ["collector"],
      storageError: { message: "The resource already exists", statusCode: "409" },
      mockBatches: [{ id: CREATED_BATCH_ID, state: "COLLECTED" }],
      mockEvidence: [
        {
          id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
          batch_id: CREATED_BATCH_ID,
          sha256: testPdfSha,
          storage_path: fixedStoragePath,
        },
      ],
    });

    const storageRetryRes = await recordCollectionWithRpc(
      storageRetryClient,
      {
        batchId: CREATED_BATCH_ID,
        intakeMassGrams: 5000,
        evidence: { bytes: samplePdfBytes, mimeType: "application/pdf" },
      },
      () => FIXED_OBJECT_ID,
    );
    assert.equal(storageRetryRes.ok, true);
    if (storageRetryRes.ok) {
      assert.equal(storageRetryRes.nextState, "COLLECTED");
    }

    // 3. RPC genuine failure: batch did NOT transition -> surfaces the real RPC error
    const uncommittedClient = createMockSupabaseClient({
      user: { id: VALID_COLLECTOR_ID, email: "collector@example.org" },
      roles: ["collector"],
      rpcError: { code: "42501", message: "caller is not the collector assigned to this batch" },
      mockBatches: [{ id: CREATED_BATCH_ID, state: "REGISTERED" }],
      mockEvidence: [],
    });

    const failedRes = await recordCollectionWithRpc(
      uncommittedClient,
      {
        batchId: CREATED_BATCH_ID,
        intakeMassGrams: 5000,
        evidence: { bytes: samplePdfBytes, mimeType: "application/pdf" },
      },
      () => FIXED_OBJECT_ID,
    );
    assert.equal(failedRes.ok, false);
    if (!failedRes.ok) {
      assert.equal(failedRes.code, "RPC_ERROR");
      assert.match(failedRes.error, /caller is not the collector assigned to this batch/i);
    }

    // 4. Processing claim reconciliation preserves totalOutputGrams
    const processingCommittedClient = createMockSupabaseClient({
      user: { id: VALID_PROCESSOR_ID, email: "processor@example.org" },
      roles: ["processor"],
      rpcError: { code: "55000", message: "invalid transition from PROCESSED_CLAIMED" },
      mockBatches: [{ id: CREATED_BATCH_ID, state: "PROCESSED_CLAIMED" }],
      mockEvidence: [
        {
          id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
          batch_id: CREATED_BATCH_ID,
          sha256: testPdfSha,
          storage_path: fixedStoragePath,
        },
      ],
    });

    const procReconciled = await submitProcessingWithRpc(
      processingCommittedClient,
      {
        batchId: CREATED_BATCH_ID,
        mode: "submit",
        intakeMassGrams: 10000,
        outputs: [
          { material_code: 201, mass_grams: 5000 },
          { material_code: 204, mass_grams: 3000 },
        ],
        evidence: { bytes: samplePdfBytes, mimeType: "application/pdf" },
        batch: makeBatchContext({ state: "RECEIVED", intake_mass_grams: 10000 }),
      },
      () => FIXED_OBJECT_ID,
    );
    assert.equal(procReconciled.ok, true);
    if (procReconciled.ok) {
      assert.equal(procReconciled.nextState, "PROCESSED_CLAIMED");
      assert.equal(procReconciled.totalOutputGrams, 8000);
    }

    // 5. Direct reconcileEvidenceState unit tests
    const directReconciled = await reconcileEvidenceState(
      committedClient,
      CREATED_BATCH_ID,
      "COLLECTED",
      testPdfSha,
      fixedStoragePath,
    );
    assert.notEqual(directReconciled, null);
    assert.equal(directReconciled?.ok, true);

    const directMismatchSha = await reconcileEvidenceState(
      committedClient,
      CREATED_BATCH_ID,
      "COLLECTED",
      "\\x1111111111111111111111111111111111111111111111111111111111111111",
      fixedStoragePath,
    );
    assert.equal(directMismatchSha, null);

    const directMismatchState = await reconcileEvidenceState(
      committedClient,
      CREATED_BATCH_ID,
      "RECEIVED",
      testPdfSha,
      fixedStoragePath,
    );
    assert.equal(directMismatchState, null);
  });
});

