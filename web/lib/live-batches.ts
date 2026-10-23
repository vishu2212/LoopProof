import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { BatchState, RejectReason, ReturnReason } from "./lifecycle";

export const APP_ROLES = ["registrar", "collector", "processor", "verifier"] as const;
export type AppRole = (typeof APP_ROLES)[number];

export const ALLOWED_EVIDENCE_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
] as const;
export type AllowedEvidenceMimeType = (typeof ALLOWED_EVIDENCE_MIME_TYPES)[number];

/** Maximum file size enforced by the `evidence` Storage bucket (`20971520` bytes = 20 MB). */
export const MAX_EVIDENCE_BYTES = 20_971_520;

/** Maximum output fractions per processing claim (`check (position between 1 and 16)`). */
export const MAX_PROCESSING_OUTPUTS = 16;

export const LIVE_RETURN_REASONS: readonly ReturnReason[] = [
  "INSUFFICIENT_EVIDENCE",
  "EVIDENCE_UNREADABLE",
  "OUTPUT_DATA_INCOMPLETE",
  "MASS_DISCREPANCY",
] as const;

export const LIVE_REJECT_REASONS: readonly RejectReason[] = [
  "EVIDENCE_INCONSISTENT",
  "MASS_BALANCE_IMPLAUSIBLE",
  "PROCESSOR_NOT_QUALIFIED",
  "CHAIN_OF_CUSTODY_BROKEN",
] as const;

export type LiveChecklistItem = {
  key: string;
  label: string;
};

/**
 * Independent verifier review checklist persisted as `{ [key]: boolean }` in
 * `public.verifier_decisions.checklist` via `lp_verify_batch`, `lp_return_batch`, and `lp_reject_batch`.
 */
export const LIVE_VERIFIER_CHECKLIST: readonly LiveChecklistItem[] = [
  {
    key: "evidence_hashes_present",
    label:
      "Collection, receipt, and processing claim evidence records and SHA-256 digests are present and distinct.",
  },
  {
    key: "files_opened_and_matched",
    label:
      "Evidence files in the private storage bucket were inspected and match their recorded SHA-256 hashes.",
  },
  {
    key: "mass_balance_within_intake",
    label:
      "Claimed processing output masses are plausible and do not exceed the recorded intake mass.",
  },
  {
    key: "verifier_independent",
    label:
      "Verifier is independent of both the assigned collector and the assigned processor.",
  },
  {
    key: "chain_of_custody_complete",
    label:
      "Chain of custody from registration through collection, receipt, and processing claim is unbroken.",
  },
] as const;


export type AuthenticatedActor = {
  id: string;
  email: string | null;
};

export type SessionRoleState = {
  user: AuthenticatedActor | null;
  roles: AppRole[];
  authError?: string;
  roleError?: string;
};

export type RegisterBatchInput = {
  categoryCode: number;
  collectorId: string;
  processorId: string;
  verifierId: string;
};

export type RegisterBatchResult =
  | { ok: true; batchId: string }
  | {
      ok: false;
      code:
        | "UNAUTHENTICATED"
        | "FORBIDDEN_ROLE"
        | "INVALID_CATEGORY"
        | "INVALID_UUID"
        | "VERIFIER_NOT_INDEPENDENT"
        | "RPC_ERROR";
      error: string;
    };

export type LiveBatchRow = {
  id: string;
  public_ref: string;
  category_code: number;
  registrar_id: string;
  collector_id: string;
  processor_id: string;
  verifier_id: string;
  state: Exclude<BatchState, "NONE">;
  intake_mass_grams: number | null;
  current_revision: number;
  created_at: string;
  updated_at: string;
};

export type LiveEvidenceRow = {
  id: string;
  batch_id: string;
  kind: "collection_record" | "receipt_record" | "processing_claim";
  revision: number | null;
  sha256: string;
  storage_bucket: string;
  storage_path: string;
  byte_size: number;
  mime_type: string;
  submitted_by: string;
  created_at: string;
};

export type LiveEventRow = {
  id: number;
  batch_id: string;
  seq: number;
  from_state: Exclude<BatchState, "NONE"> | null;
  to_state: Exclude<BatchState, "NONE">;
  actor_id: string;
  evidence_id: string | null;
  revision: number | null;
  return_reason: Exclude<ReturnReason, "NONE"> | null;
  reject_reason: Exclude<RejectReason, "NONE"> | null;
  created_at: string;
};

export type LiveDecisionRow = {
  id: string;
  batch_id: string;
  revision: number;
  decision: "verified" | "returned" | "rejected";
  return_reason: Exclude<ReturnReason, "NONE"> | null;
  reject_reason: Exclude<RejectReason, "NONE"> | null;
  checklist: Record<string, boolean>;
  verifier_id: string;
  created_at: string;
};

export type LiveOutputRow = {
  batch_id: string;
  revision: number;
  position: number;
  material_code: number;
  mass_grams: number;
};

/**
 * Columns fetched from `public.batches`. Deliberately excludes `claim_key`
 * so the 32-byte claim commitment is never read back or rendered.
 */
export const LIVE_BATCH_SELECT_COLUMNS =
  "id, public_ref, category_code, registrar_id, collector_id, processor_id, verifier_id, state, intake_mass_grams, current_revision, created_at, updated_at";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PUBLIC_REF_REGEX = /^LP-[0-9]{6,}$/;

export function isValidUuid(value: string): boolean {
  return UUID_REGEX.test(value.trim());
}

export function isPublicBatchRef(value: string): boolean {
  return PUBLIC_REF_REGEX.test(value.trim());
}

/**
 * Generates a cryptographically secure, non-zero 32-byte claim key formatted
 * as a PostgreSQL hex bytea literal (`\x` + 64 hex chars).
 * Must ONLY be called on the server and never returned to the browser or logged.
 */
export function generateClaimKeyHex(rng: (size: number) => Buffer = randomBytes): string {
  for (let attempt = 0; attempt < 8; attempt++) {
    const buf = rng(32);
    if (buf.length !== 32) {
      throw new Error("RNG must return exactly 32 bytes for claim key.");
    }
    if (buf.some((byte) => byte !== 0)) {
      return `\\x${buf.toString("hex")}`;
    }
  }
  throw new Error("Failed to generate a non-zero 32-byte claim key.");
}

export function validateRegistrationInput(
  input: RegisterBatchInput,
): { ok: true; normalized: RegisterBatchInput } | { ok: false; code: RegisterBatchResult & { ok: false } extends { code: infer C } ? C : never; error: string } {
  const categoryCode = Number(input.categoryCode);
  if (!Number.isInteger(categoryCode) || categoryCode < 1 || categoryCode > 65535) {
    return {
      ok: false,
      code: "INVALID_CATEGORY",
      error: "Category code must be an integer between 1 and 65535.",
    };
  }

  const collectorId = (input.collectorId ?? "").trim().toLowerCase();
  const processorId = (input.processorId ?? "").trim().toLowerCase();
  const verifierId = (input.verifierId ?? "").trim().toLowerCase();

  if (!isValidUuid(collectorId)) {
    return {
      ok: false,
      code: "INVALID_UUID",
      error: "Collector account ID must be a valid UUID.",
    };
  }
  if (!isValidUuid(processorId)) {
    return {
      ok: false,
      code: "INVALID_UUID",
      error: "Processor account ID must be a valid UUID.",
    };
  }
  if (!isValidUuid(verifierId)) {
    return {
      ok: false,
      code: "INVALID_UUID",
      error: "Verifier account ID must be a valid UUID.",
    };
  }

  if (verifierId === collectorId || verifierId === processorId) {
    return {
      ok: false,
      code: "VERIFIER_NOT_INDEPENDENT",
      error:
        "Verifier independence constraint: the assigned verifier must differ from both the collector and the processor (STATE_MACHINE rule 3).",
    };
  }

  return {
    ok: true,
    normalized: {
      categoryCode,
      collectorId,
      processorId,
      verifierId,
    },
  };
}

export function formatDatabaseError(err: { code?: string; message?: string; details?: string } | null | undefined): string {
  if (!err) return "Unknown database error.";
  const msg = err.message ?? "Database request failed.";
  if (/missing role registrar/i.test(msg)) {
    return "Your account does not hold the registrar role in public.user_roles (D-12).";
  }
  if (/missing role (collector|processor|verifier)/i.test(msg)) {
    return `Role check failed in database: ${msg}. Your account must hold that role in public.user_roles.`;
  }
  if (/caller is not the (registrar|collector|processor|verifier) assigned to this batch/i.test(msg)) {
    return `Assignment check failed in database: ${msg}. Only the user UUID locked to this batch at registration may execute this transition (D-15, D-17).`;
  }
  if (/assignee for (collector|processor|verifier) does not hold that role/i.test(msg)) {
    return `Role check failed in database: ${msg}. Ensure the assigned user UUID holds that role in public.user_roles.`;
  }
  if (/batches_verifier_independent|verifier must be independent/i.test(msg)) {
    return "Database constraint batches_verifier_independent: the assigned verifier must differ from both collector and processor.";
  }
  if (/evidence file has not been uploaded to the private bucket/i.test(msg)) {
    return "Evidence file has not been uploaded to the private 'evidence' Storage bucket before invoking the lifecycle RPC.";
  }
  if (/evidence_sha256_key|duplicate key value violates unique constraint.*evidence/i.test(msg) || (err.code === "23505" && /sha256|evidence/i.test(`${msg} ${err.details ?? ""}`))) {
    return "Duplicate evidence SHA-256 hash rejected: every evidence file digest must be globally unique across all batches, stages, and revisions (STATE_MACHINE rule 4).";
  }
  if (/mass balance exceeded/i.test(msg)) {
    return `Mass-balance check failed in database: ${msg}. Claimed output mass cannot exceed recorded intake mass.`;
  }
  if (/intake mass must be > 0 grams/i.test(msg)) {
    return "Intake mass check failed in database: intake mass must be greater than 0 grams.";
  }
  if (/invalid transition from/i.test(msg)) {
    return `Lifecycle state guard rejected transition: ${msg}.`;
  }
  if (/not authenticated/i.test(msg) || err.code === "28000") {
    return "Authentication required: no active Supabase session reached the database.";
  }
  return err.code ? `[${err.code}] ${msg}` : msg;
}

export function formatStorageError(
  err: { message?: string; statusCode?: string } | null | undefined,
): string {
  if (!err) return "Failed to upload evidence file to private storage.";
  const msg = err.message ?? "Storage upload failed.";
  if (/row-level security|new row violates row-level security/i.test(msg)) {
    return "Storage RLS policy rejected the upload (evidence_files_insert_actor): only the assigned actor holding the matching role may upload evidence while the batch is in the active stage.";
  }
  if (/bucket not found/i.test(msg)) {
    return "Private Storage bucket 'evidence' was not found in Supabase. Ensure the migration or storage setup script has been applied.";
  }
  return err.statusCode ? `[Storage ${err.statusCode}] ${msg}` : `Storage upload error: ${msg}`;
}

// Minimal structural interface for testability without mocking all of @supabase/supabase-js
export type SupabaseLikeClient = {
  auth: {
    getUser(): Promise<{
      data: { user: { id: string; email?: string | null } | null };
      error: { message: string } | null;
    }>;
  };
  storage?: {
    from(bucket: string): {
      upload(
        path: string,
        body: Uint8Array | Buffer | ArrayBuffer | Blob,
        options?: {
          contentType?: string;
          upsert?: boolean;
          metadata?: Record<string, any>;
        },
      ): Promise<{
        data: { path?: string } | null;
        error: { message?: string; statusCode?: string } | null;
      }>;
    };
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from(table: any): any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rpc(fn: string, args?: any): any;
};

export type LifecycleActionKind =
  | "record_collection"
  | "cancel_batch"
  | "record_receipt"
  | "submit_processing"
  | "resubmit_processing"
  | "verifier_decision";

export type MissingRoleNotice = {
  requiredRole: AppRole;
  assignedAs: string;
  message: string;
};

export type BatchLifecycleAccess = {
  allowedActions: LifecycleActionKind[];
  missingRoleNotices: MissingRoleNotice[];
  independenceViolation?: string;
  waitingForSummary: string;
};

/**
 * Determines which lifecycle actions are visible/permitted for the current authenticated user,
 * enforcing:
 *   1. User is authenticated
 *   2. User is the assigned actor on `batch` for that stage
 *   3. User holds the corresponding role in `public.user_roles`
 *   4. Batch is in the exact required lifecycle state
 *   5. Verifier is independent of collector and processor
 */
export function resolveBatchLifecycleAccess(
  batch: Pick<
    LiveBatchRow,
    "state" | "registrar_id" | "collector_id" | "processor_id" | "verifier_id"
  >,
  user: AuthenticatedActor | null,
  roles: readonly AppRole[],
): BatchLifecycleAccess {
  const allowedActions: LifecycleActionKind[] = [];
  const missingRoleNotices: MissingRoleNotice[] = [];
  let independenceViolation: string | undefined;

  const uid = user?.id.trim().toLowerCase() ?? "";
  const registrarId = batch.registrar_id.trim().toLowerCase();
  const collectorId = batch.collector_id.trim().toLowerCase();
  const processorId = batch.processor_id.trim().toLowerCase();
  const verifierId = batch.verifier_id.trim().toLowerCase();

  switch (batch.state) {
    case "REGISTERED": {
      if (uid && uid === collectorId) {
        if (roles.includes("collector")) {
          allowedActions.push("record_collection");
        } else {
          missingRoleNotices.push({
            requiredRole: "collector",
            assignedAs: "Collector",
            message:
              "Your account is the assigned collector for this batch, but does not hold the collector role in public.user_roles.",
          });
        }
      }
      if (uid && uid === registrarId) {
        if (roles.includes("registrar")) {
          allowedActions.push("cancel_batch");
        } else {
          missingRoleNotices.push({
            requiredRole: "registrar",
            assignedAs: "Registrar",
            message:
              "Your account is the assigned registrar for this batch, but does not hold the registrar role in public.user_roles.",
          });
        }
      }
      return {
        allowedActions,
        missingRoleNotices,
        waitingForSummary:
          "Batch is REGISTERED. Awaiting collection attestation, intake weight, and collection evidence from the assigned collector (public.lp_record_collection).",
      };
    }

    case "COLLECTED": {
      if (uid && uid === processorId) {
        if (roles.includes("processor")) {
          allowedActions.push("record_receipt");
        } else {
          missingRoleNotices.push({
            requiredRole: "processor",
            assignedAs: "Processor",
            message:
              "Your account is the assigned processor for this batch, but does not hold the processor role in public.user_roles.",
          });
        }
      }
      return {
        allowedActions,
        missingRoleNotices,
        waitingForSummary:
          "Batch is COLLECTED. Awaiting facility receipt attestation and receipt evidence from the assigned processor (public.lp_record_receipt).",
      };
    }

    case "RECEIVED": {
      if (uid && uid === processorId) {
        if (roles.includes("processor")) {
          allowedActions.push("submit_processing");
        } else {
          missingRoleNotices.push({
            requiredRole: "processor",
            assignedAs: "Processor",
            message:
              "Your account is the assigned processor for this batch, but does not hold the processor role in public.user_roles.",
          });
        }
      }
      return {
        allowedActions,
        missingRoleNotices,
        waitingForSummary:
          "Batch is RECEIVED. Awaiting processing claim, output fractions (mass-balance checked against intake), and processing evidence from the assigned processor (public.lp_submit_processing).",
      };
    }

    case "RETURNED": {
      if (uid && uid === processorId) {
        if (roles.includes("processor")) {
          allowedActions.push("resubmit_processing");
        } else {
          missingRoleNotices.push({
            requiredRole: "processor",
            assignedAs: "Processor",
            message:
              "Your account is the assigned processor for this batch, but does not hold the processor role in public.user_roles.",
          });
        }
      }
      return {
        allowedActions,
        missingRoleNotices,
        waitingForSummary:
          "Batch was RETURNED by the verifier for additional evidence. Awaiting replacement output fractions and a new processing evidence file from the assigned processor (public.lp_resubmit_processing).",
      };
    }

    case "PROCESSED_CLAIMED": {
      if (uid && uid === verifierId) {
        if (uid === collectorId || uid === processorId) {
          independenceViolation =
            "Verifier independence violation: the verifier must differ from both the collector and the processor (STATE_MACHINE rule 3).";
        } else if (!roles.includes("verifier")) {
          missingRoleNotices.push({
            requiredRole: "verifier",
            assignedAs: "Verifier",
            message:
              "Your account is the assigned independent verifier for this batch, but does not hold the verifier role in public.user_roles.",
          });
        } else {
          allowedActions.push("verifier_decision");
        }
      }
      return {
        allowedActions,
        missingRoleNotices,
        independenceViolation,
        waitingForSummary:
          "Batch is in PROCESSED_CLAIMED (Pending verifier review). Awaiting independent verification decision from the assigned verifier (public.lp_verify_batch, public.lp_return_batch, or public.lp_reject_batch).",
      };
    }

    case "VERIFIED":
    case "REJECTED":
    case "CANCELLED": {
      return {
        allowedActions: [],
        missingRoleNotices: [],
        waitingForSummary: `Batch is in terminal state ${batch.state}; no further lifecycle transitions are permitted.`,
      };
    }
  }
}

export type EvidenceUploadInput = {
  bytes: Uint8Array;
  mimeType: string;
  fileName?: string;
};

export type PreparedEvidenceMetadata = {
  sha256Hex: string;
  storagePath: string;
  byteSize: number;
  mimeType: AllowedEvidenceMimeType;
};

export type LifecycleErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN_ROLE"
  | "FORBIDDEN_ASSIGNMENT"
  | "INVALID_STATE"
  | "INVALID_UUID"
  | "INVALID_INTAKE_MASS"
  | "INVALID_EVIDENCE"
  | "INVALID_OUTPUTS"
  | "MASS_BALANCE_EXCEEDED"
  | "VERIFIER_NOT_INDEPENDENT"
  | "INVALID_CHECKLIST"
  | "INVALID_REASON"
  | "STORAGE_ERROR"
  | "RPC_ERROR";

export type LifecycleMutationResult =
  | {
      ok: true;
      batchId: string;
      nextState: Exclude<BatchState, "NONE">;
      sha256Hex?: string;
      storagePath?: string;
      totalOutputGrams?: number;
    }
  | {
      ok: false;
      code: LifecycleErrorCode;
      error: string;
    };

const STORAGE_PATH_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Computes the 32-byte SHA-256 digest of an evidence file as a PostgreSQL bytea hex literal (`\x` + 64 hex chars).
 */
export function computeEvidenceSha256Hex(bytes: Uint8Array): string {
  const hex = createHash("sha256").update(bytes).digest("hex").toLowerCase();
  if (hex.length !== 64 || /^0+$/.test(hex)) {
    throw new Error("Invalid SHA-256 evidence digest.");
  }
  return `\\x${hex}`;
}

/**
 * Lightweight file-signature check to catch obvious MIME spoofing before upload.
 * This is not a malware scan or a full parser; the Storage bucket must also enforce
 * size/type limits and the verifier must inspect evidence contents.
 */
export function evidenceMatchesMimeSignature(
  bytes: Uint8Array,
  mimeType: string,
): boolean {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0) return false;

  const normalizedMime = (mimeType ?? "").trim().toLowerCase();
  if (normalizedMime === "application/pdf") {
    // PDF headers are expected near the beginning; allow a small leading prefix (up to 1024 bytes per ISO 32000-1).
    const prefix = new TextDecoder().decode(bytes.subarray(0, Math.min(bytes.byteLength, 1024)));
    return prefix.includes("%PDF-");
  }
  if (normalizedMime === "image/jpeg") {
    return bytes.byteLength >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (normalizedMime === "image/png") {
    return (
      bytes.byteLength >= 8 &&
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47 &&
      bytes[4] === 0x0d &&
      bytes[5] === 0x0a &&
      bytes[6] === 0x1a &&
      bytes[7] === 0x0a
    );
  }
  return false;
}

export function validateEvidenceFileSize(
  byteSize: number,
): { ok: true } | { ok: false; code: "INVALID_EVIDENCE"; error: string } {
  if (typeof byteSize !== "number" || Number.isNaN(byteSize) || byteSize <= 0) {
    return {
      ok: false,
      code: "INVALID_EVIDENCE",
      error: "Selected evidence file is empty (0 bytes). Select a valid PDF, JPEG, or PNG file.",
    };
  }
  if (byteSize > MAX_EVIDENCE_BYTES) {
    return {
      ok: false,
      code: "INVALID_EVIDENCE",
      error: `Selected evidence file (${byteSize} bytes) exceeds the 20 MB maximum allowed in the private evidence bucket.`,
    };
  }
  return { ok: true };
}

export function validateAndPrepareEvidence(
  batchId: string,
  evidence: EvidenceUploadInput | null | undefined,
  uuidGen: () => string = randomUUID,
):
  | { ok: true; prepared: PreparedEvidenceMetadata }
  | { ok: false; code: "INVALID_UUID" | "INVALID_EVIDENCE"; error: string } {
  const normalizedBatchId = (batchId ?? "").trim().toLowerCase();
  if (!isValidUuid(normalizedBatchId)) {
    return {
      ok: false,
      code: "INVALID_UUID",
      error: "Batch ID must be a valid UUID.",
    };
  }

  if (!evidence || !(evidence.bytes instanceof Uint8Array) || evidence.bytes.byteLength <= 0) {
    return {
      ok: false,
      code: "INVALID_EVIDENCE",
      error: "An evidence file is required and must be larger than 0 bytes.",
    };
  }

  if (evidence.bytes.byteLength > MAX_EVIDENCE_BYTES) {
    return {
      ok: false,
      code: "INVALID_EVIDENCE",
      error: `Evidence file size (${evidence.bytes.byteLength} bytes) exceeds the 20 MB maximum allowed in the private evidence bucket.`,
    };
  }

  const mimeType = (evidence.mimeType ?? "").trim().toLowerCase();
  if (!(ALLOWED_EVIDENCE_MIME_TYPES as readonly string[]).includes(mimeType)) {
    return {
      ok: false,
      code: "INVALID_EVIDENCE",
      error:
        "Evidence file MIME type must be application/pdf, image/jpeg, or image/png (as enforced by public.evidence_mime_type_check).",
    };
  }

  if (!evidenceMatchesMimeSignature(evidence.bytes, mimeType)) {
    return {
      ok: false,
      code: "INVALID_EVIDENCE",
      error: "Evidence file content does not match its declared PDF, JPEG, or PNG MIME type.",
    };
  }

  const objectId = uuidGen().trim().toLowerCase();
  const storagePath = `${normalizedBatchId}/${objectId}`;
  if (!STORAGE_PATH_REGEX.test(storagePath)) {
    return {
      ok: false,
      code: "INVALID_EVIDENCE",
      error: "Generated evidence storage path must match <batch_uuid>/<object_uuid>.",
    };
  }

  const sha256Hex = computeEvidenceSha256Hex(evidence.bytes);
  return {
    ok: true,
    prepared: {
      sha256Hex,
      storagePath,
      byteSize: evidence.bytes.byteLength,
      mimeType: mimeType as AllowedEvidenceMimeType,
    },
  };
}

export type ProcessingOutputInput = {
  material_code: number;
  mass_grams: number;
};

export function validateProcessingOutputs(
  outputs: ProcessingOutputInput[],
  intakeMassGrams: number | null | undefined,
):
  | { ok: true; normalizedOutputs: ProcessingOutputInput[]; totalOutputGrams: number }
  | {
      ok: false;
      code: "INVALID_INTAKE_MASS" | "INVALID_OUTPUTS" | "MASS_BALANCE_EXCEEDED";
      error: string;
    } {
  const intake = Number(intakeMassGrams);
  if (!Number.isInteger(intake) || intake <= 0) {
    return {
      ok: false,
      code: "INVALID_INTAKE_MASS",
      error:
        "Batch intake mass must be recorded (> 0 grams) before submitting processing outputs.",
    };
  }

  if (
    !Array.isArray(outputs) ||
    outputs.length < 1 ||
    outputs.length > MAX_PROCESSING_OUTPUTS
  ) {
    return {
      ok: false,
      code: "INVALID_OUTPUTS",
      error: `Between 1 and ${MAX_PROCESSING_OUTPUTS} output fractions are required (public.lp_submit_processing).`,
    };
  }

  const normalizedOutputs: ProcessingOutputInput[] = [];
  let totalOutputGrams = 0;

  for (let i = 0; i < outputs.length; i++) {
    const entry = outputs[i];
    const materialCode = Number(entry?.material_code);
    const massGrams = Number(entry?.mass_grams);

    if (!Number.isInteger(materialCode) || materialCode < 1 || materialCode > 65535) {
      return {
        ok: false,
        code: "INVALID_OUTPUTS",
        error: `Output fraction #${i + 1}: material_code must be an integer between 1 and 65535.`,
      };
    }

    if (!Number.isInteger(massGrams) || massGrams <= 0) {
      return {
        ok: false,
        code: "INVALID_OUTPUTS",
        error: `Output fraction #${i + 1}: mass_grams must be a whole number greater than 0 grams.`,
      };
    }

    if (massGrams > intake) {
      return {
        ok: false,
        code: "MASS_BALANCE_EXCEEDED",
        error: `Mass balance exceeded: output fraction #${i + 1} (${massGrams} g) exceeds recorded intake mass (${intake} g).`,
      };
    }

    totalOutputGrams += massGrams;
    normalizedOutputs.push({ material_code: materialCode, mass_grams: massGrams });
  }

  if (totalOutputGrams > intake) {
    return {
      ok: false,
      code: "MASS_BALANCE_EXCEEDED",
      error: `Mass balance exceeded: total claimed outputs (${totalOutputGrams} g) exceed recorded intake mass (${intake} g) (STATE_MACHINE rule 5).`,
    };
  }

  return {
    ok: true,
    normalizedOutputs,
    totalOutputGrams,
  };
}

export function validateChecklist(
  checklist: Record<string, unknown> | null | undefined,
):
  | { ok: true; normalizedChecklist: Record<string, boolean> }
  | { ok: false; code: "INVALID_CHECKLIST"; error: string } {
  if (!checklist || typeof checklist !== "object" || Array.isArray(checklist)) {
    return {
      ok: false,
      code: "INVALID_CHECKLIST",
      error: "Checklist must be a JSON object of boolean items.",
    };
  }

  const entries = Object.entries(checklist);
  if (entries.length > 20) {
    return {
      ok: false,
      code: "INVALID_CHECKLIST",
      error: "Checklist must contain at most 20 boolean items (private.decide).",
    };
  }

  const normalizedChecklist: Record<string, boolean> = {};
  for (const [key, val] of entries) {
    if (!key || key.length > 64 || typeof val !== "boolean") {
      return {
        ok: false,
        code: "INVALID_CHECKLIST",
        error: "Each checklist item must have a key of 1–64 characters and a boolean value.",
      };
    }
    normalizedChecklist[key] = val;
  }

  return { ok: true, normalizedChecklist };
}

export type BatchContextForValidation = Pick<
  LiveBatchRow,
  "id" | "state" | "registrar_id" | "collector_id" | "processor_id" | "verifier_id" | "intake_mass_grams"
> & {
  current_revision?: number;
  claimed_output_grams?: number | null;
};

/**
 * Idempotently reconciles client state after a network timeout or ambiguous RPC failure.
 * If the batch has already reached the target state and the evidence row exists with the
 * expected SHA-256 (or storage path), the operation succeeded previously and is treated as success.
 * This avoids duplicate mutations while protecting against destructive deletion of committed evidence.
 */
export async function reconcileEvidenceState(
  client: SupabaseLikeClient,
  batchId: string,
  targetState: BatchState,
  sha256Hex: string,
  storagePath?: string,
  totalOutputGrams?: number,
): Promise<LifecycleMutationResult | null> {
  try {
    const batchQuery = client.from("batches").select("id, state").eq("id", batchId);
    const { data: batchData, error: batchErr } =
      typeof batchQuery?.maybeSingle === "function"
        ? await batchQuery.maybeSingle()
        : await batchQuery;

    const row = Array.isArray(batchData) ? batchData[0] : batchData;
    if (batchErr || !row || (row as { state?: string }).state !== targetState) {
      return null;
    }

    const evQuery = client
      .from("evidence")
      .select("id, sha256, storage_path")
      .eq("batch_id", batchId);
    const { data: evData, error: evErr } =
      typeof evQuery?.maybeSingle === "function"
        ? await evQuery
        : await evQuery;

    const evList = Array.isArray(evData) ? evData : evData ? [evData] : [];
    if (evErr || evList.length === 0) {
      return null;
    }

    const normalizedExpectedSha = sha256Hex.replace(/^\\x/i, "").toLowerCase();
    const matchingRow = evList.find((item: { sha256?: string; storage_path?: string }) => {
      const rowSha = String(item.sha256 ?? "").replace(/^\\x/i, "").toLowerCase();
      return rowSha === normalizedExpectedSha;
    });

    if (!matchingRow) {
      return null;
    }

    return {
      ok: true,
      batchId,
      nextState: targetState as Exclude<BatchState, "NONE">,
      sha256Hex,
      storagePath: matchingRow.storage_path ?? storagePath,
      ...(typeof totalOutputGrams === "number" ? { totalOutputGrams } : {}),
    };
  } catch {
    return null;
  }
}

export type RecordCollectionInput = {
  batchId: string;
  intakeMassGrams: number;
  evidence: EvidenceUploadInput;
  batch?: BatchContextForValidation;
};

/**
 * Collector lifecycle transition: `REGISTERED -> COLLECTED` via `public.lp_record_collection`.
 * Uploads collection evidence to the private `evidence` Storage bucket first, then invokes the RPC.
 */
export async function recordCollectionWithRpc(
  client: SupabaseLikeClient,
  input: RecordCollectionInput,
  uuidGen: () => string = randomUUID,
): Promise<LifecycleMutationResult> {
  const session = await getCurrentUserWithRoles(client);
  if (!session.user) {
    return {
      ok: false,
      code: "UNAUTHENTICATED",
      error: "You must be signed in to record batch collection.",
    };
  }

  if (!session.roles.includes("collector")) {
    return {
      ok: false,
      code: "FORBIDDEN_ROLE",
      error:
        "Missing role collector: your signed-in account does not hold the collector role in public.user_roles.",
    };
  }

  const normalizedBatchId = (input.batchId ?? "").trim().toLowerCase();
  if (!isValidUuid(normalizedBatchId)) {
    return {
      ok: false,
      code: "INVALID_UUID",
      error: "Batch ID must be a valid UUID.",
    };
  }

  if (input.batch) {
    if (input.batch.collector_id.trim().toLowerCase() !== session.user.id.trim().toLowerCase()) {
      return {
        ok: false,
        code: "FORBIDDEN_ASSIGNMENT",
        error: "Caller is not the collector assigned to this batch (D-15, D-17).",
      };
    }
    if (input.batch.state !== "REGISTERED") {
      return {
        ok: false,
        code: "INVALID_STATE",
        error: `Collection can only be recorded when the batch is in REGISTERED state (current state: ${input.batch.state}).`,
      };
    }
  }

  const intakeMassGrams = Number(input.intakeMassGrams);
  if (!Number.isInteger(intakeMassGrams) || intakeMassGrams <= 0) {
    return {
      ok: false,
      code: "INVALID_INTAKE_MASS",
      error: "Intake mass must be a whole number greater than 0 grams.",
    };
  }

  const evidenceCheck = validateAndPrepareEvidence(normalizedBatchId, input.evidence, uuidGen);
  if (!evidenceCheck.ok) {
    return evidenceCheck;
  }

  const { prepared } = evidenceCheck;
  if (!client.storage) {
    return {
      ok: false,
      code: "STORAGE_ERROR",
      error: "Supabase Storage client is unavailable; cannot upload collection evidence.",
    };
  }

  const { error: uploadError } = await client.storage
    .from("evidence")
    .upload(prepared.storagePath, input.evidence.bytes, {
      contentType: prepared.mimeType,
      upsert: false,
      metadata: {
        sha256: prepared.sha256Hex.replace(/^\\x/, ""),
      },
    });

  if (uploadError) {
    const reconciled = await reconcileEvidenceState(
      client,
      normalizedBatchId,
      "COLLECTED",
      prepared.sha256Hex,
      prepared.storagePath,
    );
    if (reconciled) {
      return reconciled;
    }
    return {
      ok: false,
      code: "STORAGE_ERROR",
      error: formatStorageError(uploadError),
    };
  }

  const { error: rpcError } = await client.rpc("lp_record_collection", {
    p_batch_id: normalizedBatchId,
    p_intake_mass_grams: intakeMassGrams,
    p_sha256: prepared.sha256Hex,
    p_storage_path: prepared.storagePath,
    p_byte_size: prepared.byteSize,
    p_mime_type: prepared.mimeType,
  });

  if (rpcError) {
    const reconciled = await reconcileEvidenceState(
      client,
      normalizedBatchId,
      "COLLECTED",
      prepared.sha256Hex,
      prepared.storagePath,
    );
    if (reconciled) {
      return reconciled;
    }
    return {
      ok: false,
      code: "RPC_ERROR",
      error: formatDatabaseError(rpcError),
    };
  }

  return {
    ok: true,
    batchId: normalizedBatchId,
    nextState: "COLLECTED",
    sha256Hex: prepared.sha256Hex,
    storagePath: prepared.storagePath,
  };
}

export type RecordReceiptInput = {
  batchId: string;
  evidence: EvidenceUploadInput;
  batch?: BatchContextForValidation;
};

/**
 * Processor lifecycle transition: `COLLECTED -> RECEIVED` via `public.lp_record_receipt`.
 */
export async function recordReceiptWithRpc(
  client: SupabaseLikeClient,
  input: RecordReceiptInput,
  uuidGen: () => string = randomUUID,
): Promise<LifecycleMutationResult> {
  const session = await getCurrentUserWithRoles(client);
  if (!session.user) {
    return {
      ok: false,
      code: "UNAUTHENTICATED",
      error: "You must be signed in to record facility receipt.",
    };
  }

  if (!session.roles.includes("processor")) {
    return {
      ok: false,
      code: "FORBIDDEN_ROLE",
      error:
        "Missing role processor: your signed-in account does not hold the processor role in public.user_roles.",
    };
  }

  const normalizedBatchId = (input.batchId ?? "").trim().toLowerCase();
  if (!isValidUuid(normalizedBatchId)) {
    return {
      ok: false,
      code: "INVALID_UUID",
      error: "Batch ID must be a valid UUID.",
    };
  }

  if (input.batch) {
    if (input.batch.processor_id.trim().toLowerCase() !== session.user.id.trim().toLowerCase()) {
      return {
        ok: false,
        code: "FORBIDDEN_ASSIGNMENT",
        error: "Caller is not the processor assigned to this batch (D-15, D-17).",
      };
    }
    if (input.batch.state !== "COLLECTED") {
      return {
        ok: false,
        code: "INVALID_STATE",
        error: `Facility receipt can only be recorded when the batch is in COLLECTED state (current state: ${input.batch.state}).`,
      };
    }
  }

  const evidenceCheck = validateAndPrepareEvidence(normalizedBatchId, input.evidence, uuidGen);
  if (!evidenceCheck.ok) {
    return evidenceCheck;
  }

  const { prepared } = evidenceCheck;
  if (!client.storage) {
    return {
      ok: false,
      code: "STORAGE_ERROR",
      error: "Supabase Storage client is unavailable; cannot upload receipt evidence.",
    };
  }

  const { error: uploadError } = await client.storage
    .from("evidence")
    .upload(prepared.storagePath, input.evidence.bytes, {
      contentType: prepared.mimeType,
      upsert: false,
      metadata: {
        sha256: prepared.sha256Hex.replace(/^\\x/, ""),
      },
    });

  if (uploadError) {
    const reconciled = await reconcileEvidenceState(
      client,
      normalizedBatchId,
      "RECEIVED",
      prepared.sha256Hex,
      prepared.storagePath,
    );
    if (reconciled) {
      return reconciled;
    }
    return {
      ok: false,
      code: "STORAGE_ERROR",
      error: formatStorageError(uploadError),
    };
  }

  const { error: rpcError } = await client.rpc("lp_record_receipt", {
    p_batch_id: normalizedBatchId,
    p_sha256: prepared.sha256Hex,
    p_storage_path: prepared.storagePath,
    p_byte_size: prepared.byteSize,
    p_mime_type: prepared.mimeType,
  });

  if (rpcError) {
    const reconciled = await reconcileEvidenceState(
      client,
      normalizedBatchId,
      "RECEIVED",
      prepared.sha256Hex,
      prepared.storagePath,
    );
    if (reconciled) {
      return reconciled;
    }
    return {
      ok: false,
      code: "RPC_ERROR",
      error: formatDatabaseError(rpcError),
    };
  }

  return {
    ok: true,
    batchId: normalizedBatchId,
    nextState: "RECEIVED",
    sha256Hex: prepared.sha256Hex,
    storagePath: prepared.storagePath,
  };
}

export type SubmitProcessingInput = {
  batchId: string;
  mode: "submit" | "resubmit";
  intakeMassGrams: number | null;
  outputs: ProcessingOutputInput[];
  evidence: EvidenceUploadInput;
  batch?: BatchContextForValidation;
};

/**
 * Processor lifecycle transition:
 * - `mode: "submit"` calls `public.lp_submit_processing` (`RECEIVED -> PROCESSED_CLAIMED`)
 * - `mode: "resubmit"` calls `public.lp_resubmit_processing` (`RETURNED -> PROCESSED_CLAIMED`)
 */
export async function submitProcessingWithRpc(
  client: SupabaseLikeClient,
  input: SubmitProcessingInput,
  uuidGen: () => string = randomUUID,
): Promise<LifecycleMutationResult> {
  const session = await getCurrentUserWithRoles(client);
  if (!session.user) {
    return {
      ok: false,
      code: "UNAUTHENTICATED",
      error: "You must be signed in to submit a processing claim.",
    };
  }

  if (!session.roles.includes("processor")) {
    return {
      ok: false,
      code: "FORBIDDEN_ROLE",
      error:
        "Missing role processor: your signed-in account does not hold the processor role in public.user_roles.",
    };
  }

  const normalizedBatchId = (input.batchId ?? "").trim().toLowerCase();
  if (!isValidUuid(normalizedBatchId)) {
    return {
      ok: false,
      code: "INVALID_UUID",
      error: "Batch ID must be a valid UUID.",
    };
  }

  const expectedState = input.mode === "resubmit" ? "RETURNED" : "RECEIVED";
  if (input.batch) {
    if (input.batch.processor_id.trim().toLowerCase() !== session.user.id.trim().toLowerCase()) {
      return {
        ok: false,
        code: "FORBIDDEN_ASSIGNMENT",
        error: "Caller is not the processor assigned to this batch (D-15, D-17).",
      };
    }
    if (input.batch.state !== expectedState) {
      return {
        ok: false,
        code: "INVALID_STATE",
        error: `Processing claim (${input.mode}) requires batch state ${expectedState} (current state: ${input.batch.state}).`,
      };
    }
  }

  const effectiveIntake = input.batch ? input.batch.intake_mass_grams : input.intakeMassGrams;
  const outputsCheck = validateProcessingOutputs(input.outputs, effectiveIntake);
  if (!outputsCheck.ok) {
    return outputsCheck;
  }

  const evidenceCheck = validateAndPrepareEvidence(normalizedBatchId, input.evidence, uuidGen);
  if (!evidenceCheck.ok) {
    return evidenceCheck;
  }

  const { prepared } = evidenceCheck;
  if (!client.storage) {
    return {
      ok: false,
      code: "STORAGE_ERROR",
      error: "Supabase Storage client is unavailable; cannot upload processing claim evidence.",
    };
  }

  const { error: uploadError } = await client.storage
    .from("evidence")
    .upload(prepared.storagePath, input.evidence.bytes, {
      contentType: prepared.mimeType,
      upsert: false,
      metadata: {
        sha256: prepared.sha256Hex.replace(/^\\x/, ""),
      },
    });

  if (uploadError) {
    const reconciled = await reconcileEvidenceState(
      client,
      normalizedBatchId,
      "PROCESSED_CLAIMED",
      prepared.sha256Hex,
      prepared.storagePath,
      outputsCheck.totalOutputGrams,
    );
    if (reconciled) {
      return reconciled;
    }
    return {
      ok: false,
      code: "STORAGE_ERROR",
      error: formatStorageError(uploadError),
    };
  }

  const rpcName =
    input.mode === "resubmit" ? "lp_resubmit_processing" : "lp_submit_processing";
  const { error: rpcError } = await client.rpc(rpcName, {
    p_batch_id: normalizedBatchId,
    p_outputs: outputsCheck.normalizedOutputs,
    p_sha256: prepared.sha256Hex,
    p_storage_path: prepared.storagePath,
    p_byte_size: prepared.byteSize,
    p_mime_type: prepared.mimeType,
  });

  if (rpcError) {
    const reconciled = await reconcileEvidenceState(
      client,
      normalizedBatchId,
      "PROCESSED_CLAIMED",
      prepared.sha256Hex,
      prepared.storagePath,
      outputsCheck.totalOutputGrams,
    );
    if (reconciled) {
      return reconciled;
    }
    return {
      ok: false,
      code: "RPC_ERROR",
      error: formatDatabaseError(rpcError),
    };
  }

  return {
    ok: true,
    batchId: normalizedBatchId,
    nextState: "PROCESSED_CLAIMED",
    sha256Hex: prepared.sha256Hex,
    storagePath: prepared.storagePath,
    totalOutputGrams: outputsCheck.totalOutputGrams,
  };
}

export type MassBalanceContext = {
  intakeMassGrams?: number | null;
  claimedOutputGrams?: number | null;
};

/**
 * Returns `false` when both recorded intake mass and claimed output mass for the
 * active revision are known and equal (`unaccounted mass === 0 g`), meaning there
 * is no mass discrepancy between claimed outputs and recorded intake.
 */
export function hasMassDiscrepancy(context?: MassBalanceContext): boolean {
  const intake = context?.intakeMassGrams;
  const claimed = context?.claimedOutputGrams;
  if (
    typeof intake === "number" &&
    Number.isFinite(intake) &&
    intake > 0 &&
    typeof claimed === "number" &&
    Number.isFinite(claimed) &&
    claimed >= 0
  ) {
    return claimed !== intake;
  }
  return true;
}

/**
 * Determines whether the top-level Return / Reject outcome banner should be
 * displayed for a live batch. A prior revision's `RETURNED` decision must not
 * remain displayed as the active batch outcome once the processor has submitted
 * a newer revision (`PROCESSED_CLAIMED`) or the batch has reached `VERIFIED`.
 */
export function shouldDisplayLiveOutcomeBanner(
  batchState: Exclude<BatchState, "NONE">,
  currentRevision: number,
  latestDecision: Pick<
    LiveDecisionRow,
    "revision" | "decision" | "return_reason" | "reject_reason"
  > | null | undefined,
): boolean {
  if (!latestDecision) return false;
  if (latestDecision.revision !== currentRevision) return false;
  if (batchState === "RETURNED") {
    return latestDecision.decision === "returned" && Boolean(latestDecision.return_reason);
  }
  if (batchState === "REJECTED") {
    return latestDecision.decision === "rejected" && Boolean(latestDecision.reject_reason);
  }
  return false;
}

export type VerifierDecisionInput = {
  batchId: string;
  decision: "verified" | "returned" | "rejected";
  returnReason?: string | null;
  rejectReason?: string | null;
  checklist?: Record<string, unknown> | null;
  collectorId?: string;
  processorId?: string;
  intakeMassGrams?: number | null;
  claimedOutputGrams?: number | null;
  batch?: BatchContextForValidation;
};

export function getVerifierDecisionSubmitLabel(
  decision: "verified" | "returned" | "rejected",
): string {
  if (decision === "verified") {
    return "Approve & Verify Claim (VERIFIED)";
  }
  if (decision === "returned") {
    return "Return for More Evidence (RETURNED)";
  }
  return "Reject Claim (REJECTED)";
}

export function validateVerifierDecisionReason(
  decision: string,
  returnReason?: string | null,
  rejectReason?: string | null,
  massBalance?: MassBalanceContext,
):
  | {
      ok: true;
      decision: "verified" | "returned" | "rejected";
      returnReason: ReturnReason | null;
      rejectReason: RejectReason | null;
    }
  | {
      ok: false;
      code: "INVALID_REASON";
      error: string;
    } {
  const normalizedDecision = (decision ?? "").trim();
  if (normalizedDecision === "verified") {
    return {
      ok: true,
      decision: "verified",
      returnReason: null,
      rejectReason: null,
    };
  }

  if (normalizedDecision === "returned") {
    const reason = (returnReason ?? "").trim();
    if (!(LIVE_RETURN_REASONS as readonly string[]).includes(reason)) {
      return {
        ok: false,
        code: "INVALID_REASON",
        error:
          "Return reason is required and must be a valid public.return_reason code (INSUFFICIENT_EVIDENCE, EVIDENCE_UNREADABLE, OUTPUT_DATA_INCOMPLETE, or MASS_DISCREPANCY).",
      };
    }
    if (reason === "MASS_DISCREPANCY" && !hasMassDiscrepancy(massBalance)) {
      return {
        ok: false,
        code: "INVALID_REASON",
        error:
          "Cannot return batch for MASS_DISCREPANCY when claimed output mass equals recorded intake mass (0 g unaccounted mass).",
      };
    }
    return {
      ok: true,
      decision: "returned",
      returnReason: reason as ReturnReason,
      rejectReason: null,
    };
  }

  if (normalizedDecision === "rejected") {
    const reason = (rejectReason ?? "").trim();
    if (!(LIVE_REJECT_REASONS as readonly string[]).includes(reason)) {
      return {
        ok: false,
        code: "INVALID_REASON",
        error:
          "Reject reason is required and must be a valid public.reject_reason code (EVIDENCE_INCONSISTENT, MASS_BALANCE_IMPLAUSIBLE, PROCESSOR_NOT_QUALIFIED, or CHAIN_OF_CUSTODY_BROKEN).",
      };
    }
    return {
      ok: true,
      decision: "rejected",
      returnReason: null,
      rejectReason: reason as RejectReason,
    };
  }

  return {
    ok: false,
    code: "INVALID_REASON",
    error: "Select a valid verifier decision (Approve, Return, or Reject).",
  };
}

/**
 * Verifier lifecycle transition from `PROCESSED_CLAIMED`:
 * - `decision: "verified"` -> `public.lp_verify_batch` (`VERIFIED`)
 * - `decision: "returned"` -> `public.lp_return_batch` (`RETURNED`)
 * - `decision: "rejected"` -> `public.lp_reject_batch` (`REJECTED`)
 */
export async function decideBatchWithRpc(
  client: SupabaseLikeClient,
  input: VerifierDecisionInput,
): Promise<LifecycleMutationResult> {
  const session = await getCurrentUserWithRoles(client);
  if (!session.user) {
    return {
      ok: false,
      code: "UNAUTHENTICATED",
      error: "You must be signed in to submit a verifier decision.",
    };
  }

  if (!session.roles.includes("verifier")) {
    return {
      ok: false,
      code: "FORBIDDEN_ROLE",
      error:
        "Missing role verifier: your signed-in account does not hold the verifier role in public.user_roles.",
    };
  }

  const normalizedBatchId = (input.batchId ?? "").trim().toLowerCase();
  if (!isValidUuid(normalizedBatchId)) {
    return {
      ok: false,
      code: "INVALID_UUID",
      error: "Batch ID must be a valid UUID.",
    };
  }

  const uid = session.user.id.trim().toLowerCase();
  const collectorId = (input.batch?.collector_id ?? input.collectorId ?? "")
    .trim()
    .toLowerCase();
  const processorId = (input.batch?.processor_id ?? input.processorId ?? "")
    .trim()
    .toLowerCase();

  if (input.batch) {
    if (input.batch.verifier_id.trim().toLowerCase() !== uid) {
      return {
        ok: false,
        code: "FORBIDDEN_ASSIGNMENT",
        error: "Caller is not the verifier assigned to this batch (D-15, D-17).",
      };
    }
    if (input.batch.state !== "PROCESSED_CLAIMED") {
      return {
        ok: false,
        code: "INVALID_STATE",
        error: `Verifier decisions are only allowed when the batch is in PROCESSED_CLAIMED state (current state: ${input.batch.state}).`,
      };
    }
  }

  if ((collectorId && uid === collectorId) || (processorId && uid === processorId)) {
    return {
      ok: false,
      code: "VERIFIER_NOT_INDEPENDENT",
      error:
        "Verifier independence rule: the verifier must differ from both the collector and the processor (STATE_MACHINE rule 3).",
    };
  }

  const checklistResult = validateChecklist(input.checklist ?? {});
  if (!checklistResult.ok) {
    return checklistResult;
  }

  const reasonCheck = validateVerifierDecisionReason(
    input.decision,
    input.returnReason,
    input.rejectReason,
    {
      intakeMassGrams: input.batch?.intake_mass_grams ?? input.intakeMassGrams,
      claimedOutputGrams: input.batch?.claimed_output_grams ?? input.claimedOutputGrams,
    },
  );
  if (!reasonCheck.ok) {
    return reasonCheck;
  }

  if (reasonCheck.decision === "verified") {
    const { error } = await client.rpc("lp_verify_batch", {
      p_batch_id: normalizedBatchId,
      p_checklist: checklistResult.normalizedChecklist,
    });
    if (error) {
      return {
        ok: false,
        code: "RPC_ERROR",
        error: formatDatabaseError(error),
      };
    }
    return {
      ok: true,
      batchId: normalizedBatchId,
      nextState: "VERIFIED",
    };
  }

  if (reasonCheck.decision === "returned") {
    const { error } = await client.rpc("lp_return_batch", {
      p_batch_id: normalizedBatchId,
      p_reason: reasonCheck.returnReason,
      p_checklist: checklistResult.normalizedChecklist,
    });
    if (error) {
      return {
        ok: false,
        code: "RPC_ERROR",
        error: formatDatabaseError(error),
      };
    }
    return {
      ok: true,
      batchId: normalizedBatchId,
      nextState: "RETURNED",
    };
  }

  const { error } = await client.rpc("lp_reject_batch", {
    p_batch_id: normalizedBatchId,
    p_reason: reasonCheck.rejectReason,
    p_checklist: checklistResult.normalizedChecklist,
  });
  if (error) {
    return {
      ok: false,
      code: "RPC_ERROR",
      error: formatDatabaseError(error),
    };
  }
  return {
    ok: true,
    batchId: normalizedBatchId,
    nextState: "REJECTED",
  };
}

/**
 * Parses `FormData` from the verifier decision form, validates the decision,
 * reason enum, and checklist, and invokes `decideBatchWithRpc`.
 * For approval (`decision === "verified"`), no return or rejection reason is sent.
 */
export async function submitVerifierDecisionFormData(
  client: SupabaseLikeClient,
  formData: FormData,
  batch?: BatchContextForValidation,
): Promise<{
  status: "success" | "error";
  code?: LifecycleErrorCode;
  message: string;
  batchId?: string;
  nextState?: Exclude<BatchState, "NONE">;
}> {
  const batchId = String(formData.get("batchId") ?? "").trim();
  const decisionRaw = String(formData.get("decision") ?? "").trim();
  const returnReasonRaw = formData.get("returnReason");
  const rejectReasonRaw = formData.get("rejectReason");
  const checklistJson = String(formData.get("checklistJson") ?? "{}");
  const formIntakeRaw = formData.get("intakeMassGrams");
  const formClaimedRaw = formData.get("claimedOutputGrams");

  const intakeMassGrams =
    batch?.intake_mass_grams ??
    (formIntakeRaw !== null && String(formIntakeRaw).trim() !== ""
      ? Number(formIntakeRaw)
      : undefined);
  const claimedOutputGrams =
    batch?.claimed_output_grams ??
    (formClaimedRaw !== null && String(formClaimedRaw).trim() !== ""
      ? Number(formClaimedRaw)
      : undefined);

  const reasonCheck = validateVerifierDecisionReason(
    decisionRaw,
    returnReasonRaw !== null ? String(returnReasonRaw) : null,
    rejectReasonRaw !== null ? String(rejectReasonRaw) : null,
    { intakeMassGrams, claimedOutputGrams },
  );
  if (!reasonCheck.ok) {
    return {
      status: "error",
      code: reasonCheck.code,
      message: reasonCheck.error,
    };
  }

  let checklist: Record<string, unknown>;
  try {
    const parsed = JSON.parse(checklistJson);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Checklist must be a JSON object.");
    }
    checklist = parsed as Record<string, unknown>;
  } catch {
    return {
      status: "error",
      code: "INVALID_CHECKLIST",
      message: "Invalid verifier checklist format.",
    };
  }

  const decisionInput: VerifierDecisionInput = {
    batchId,
    decision: reasonCheck.decision,
    ...(reasonCheck.decision === "returned"
      ? { returnReason: reasonCheck.returnReason }
      : {}),
    ...(reasonCheck.decision === "rejected"
      ? { rejectReason: reasonCheck.rejectReason }
      : {}),
    checklist,
    intakeMassGrams,
    claimedOutputGrams,
    batch,
  };

  const result = await decideBatchWithRpc(client, decisionInput);
  if (!result.ok) {
    return {
      status: "error",
      code: result.code,
      message: result.error,
    };
  }

  const rpcMap = {
    verified: "public.lp_verify_batch",
    returned: "public.lp_return_batch",
    rejected: "public.lp_reject_batch",
  } as const;

  return {
    status: "success",
    batchId: result.batchId,
    nextState: result.nextState,
    message: `Verifier decision recorded via ${rpcMap[reasonCheck.decision]}. Batch transitioned to ${result.nextState}.`,
  };
}

export type CancelBatchInput = {
  batchId: string;
  batch?: BatchContextForValidation;
};

/**
 * Registrar lifecycle transition: `REGISTERED -> CANCELLED` via `public.lp_cancel_batch`.
 */
export async function cancelBatchWithRpc(
  client: SupabaseLikeClient,
  input: CancelBatchInput,
): Promise<LifecycleMutationResult> {
  const session = await getCurrentUserWithRoles(client);
  if (!session.user) {
    return {
      ok: false,
      code: "UNAUTHENTICATED",
      error: "You must be signed in to cancel a batch.",
    };
  }

  if (!session.roles.includes("registrar")) {
    return {
      ok: false,
      code: "FORBIDDEN_ROLE",
      error:
        "Missing role registrar: your signed-in account does not hold the registrar role in public.user_roles.",
    };
  }

  const normalizedBatchId = (input.batchId ?? "").trim().toLowerCase();
  if (!isValidUuid(normalizedBatchId)) {
    return {
      ok: false,
      code: "INVALID_UUID",
      error: "Batch ID must be a valid UUID.",
    };
  }

  if (input.batch) {
    if (input.batch.registrar_id.trim().toLowerCase() !== session.user.id.trim().toLowerCase()) {
      return {
        ok: false,
        code: "FORBIDDEN_ASSIGNMENT",
        error: "Caller is not the registrar assigned to this batch (D-15, D-17).",
      };
    }
    if (input.batch.state !== "REGISTERED") {
      return {
        ok: false,
        code: "INVALID_STATE",
        error: `A batch can only be cancelled while in REGISTERED state before collection (current state: ${input.batch.state}).`,
      };
    }
  }

  const { error } = await client.rpc("lp_cancel_batch", {
    p_batch_id: normalizedBatchId,
  });

  if (error) {
    return {
      ok: false,
      code: "RPC_ERROR",
      error: formatDatabaseError(error),
    };
  }

  return {
    ok: true,
    batchId: normalizedBatchId,
    nextState: "CANCELLED",
  };
}


export async function getCurrentUserWithRoles(
  client: SupabaseLikeClient,
): Promise<SessionRoleState> {
  const { data, error: authError } = await client.auth.getUser();
  const user = data?.user;

  if (!user) {
    return {
      user: null,
      roles: [],
      authError: authError?.message,
    };
  }

  const { data: roleRows, error: roleError } = await client
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id);

  const roles = Array.isArray(roleRows)
    ? roleRows
        .map((r) => (r as { role?: string }).role)
        .filter((r): r is AppRole =>
          typeof r === "string" && (APP_ROLES as readonly string[]).includes(r),
        )
    : [];

  return {
    user: { id: user.id, email: user.email ?? null },
    roles,
    roleError: roleError?.message,
  };
}

/**
 * Protected server-side batch registration using `public.lp_register_batch`.
 * Generates the 32-byte claim key on the server and never exposes or logs it.
 */
export async function registerBatchWithRpc(
  client: SupabaseLikeClient,
  input: RegisterBatchInput,
  rng: (size: number) => Buffer = randomBytes,
): Promise<RegisterBatchResult> {
  const session = await getCurrentUserWithRoles(client);
  if (!session.user) {
    return {
      ok: false,
      code: "UNAUTHENTICATED",
      error: "You must be signed in to register a batch.",
    };
  }

  if (!session.roles.includes("registrar")) {
    return {
      ok: false,
      code: "FORBIDDEN_ROLE",
      error:
        "Missing role registrar: your signed-in account is not granted the registrar role in public.user_roles (D-12).",
    };
  }

  const validated = validateRegistrationInput(input);
  if (!validated.ok) {
    return {
      ok: false,
      code: validated.code,
      error: validated.error,
    };
  }

  // Generate opaque 32-byte claim key exclusively on the server.
  const claimKeyHex = generateClaimKeyHex(rng);

  const { data, error } = await client.rpc("lp_register_batch", {
    p_claim_key: claimKeyHex,
    p_category_code: validated.normalized.categoryCode,
    p_collector: validated.normalized.collectorId,
    p_processor: validated.normalized.processorId,
    p_verifier: validated.normalized.verifierId,
  });

  if (error || !data) {
    return {
      ok: false,
      code: "RPC_ERROR",
      error: formatDatabaseError(error),
    };
  }

  return {
    ok: true,
    batchId: String(data),
  };
}

/**
 * Formats a Postgres bytea hex string (`\x...`) as a shortened SHA-256 display string
 * so full 32-byte hashes remain readable without truncating the underlying database value.
 */
export function formatByteaHex(byteaHex: string | null | undefined): string {
  if (!byteaHex) return "—";
  const cleaned = byteaHex.replace(/^\\x/i, "").toLowerCase();
  if (cleaned.length === 64) {
    return `0x${cleaned.slice(0, 8)}…${cleaned.slice(-8)}`;
  }
  return byteaHex;
}

export function formatShortUuid(uuid: string | null | undefined): string {
  if (!uuid) return "—";
  if (uuid.length === 36) {
    return `${uuid.slice(0, 8)}…${uuid.slice(-4)}`;
  }
  return uuid;
}
