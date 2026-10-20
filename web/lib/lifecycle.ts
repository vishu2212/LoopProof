/**
 * Canonical LoopProof lifecycle. Mirrors `enum BatchState` in
 * contracts/LoopProofTypes.sol and docs/STATE_MACHINE.md.
 * Order matters: it is checked against the Solidity enum by web/tests/lifecycle.test.ts.
 * This file must stay dependency-free (it is imported directly by Node's test runner).
 */
export const BATCH_STATES = [
  "NONE",
  "REGISTERED",
  "COLLECTED",
  "RECEIVED",
  "PROCESSED_CLAIMED",
  "VERIFIED",
  "RETURNED",
  "REJECTED",
  "CANCELLED",
] as const;

export type BatchState = (typeof BATCH_STATES)[number];

/** The happy-path lifecycle, in order. */
export const CANONICAL_STAGES = [
  "REGISTERED",
  "COLLECTED",
  "RECEIVED",
  "PROCESSED_CLAIMED",
  "VERIFIED",
] as const;

export type CanonicalStage = (typeof CANONICAL_STAGES)[number];

/** Alternative outcomes — not stages of the happy path. */
export const ALTERNATIVE_OUTCOMES = ["RETURNED", "REJECTED", "CANCELLED"] as const;
export type AlternativeOutcome = (typeof ALTERNATIVE_OUTCOMES)[number];

export const STATE_LABEL: Record<Exclude<BatchState, "NONE">, string> = {
  REGISTERED: "Registered",
  COLLECTED: "Collected",
  RECEIVED: "Received",
  PROCESSED_CLAIMED: "Processing claimed",
  VERIFIED: "Verified",
  RETURNED: "Returned",
  REJECTED: "Rejected",
  CANCELLED: "Cancelled",
};

/** What each state records — deliberately never more than a recorded claim/attestation. */
export const STATE_MEANING: Record<Exclude<BatchState, "NONE">, string> = {
  REGISTERED: "Batch created. Nothing has been collected yet.",
  COLLECTED: "The collector attests it collected the batch. Collected does not mean recycled.",
  RECEIVED: "The processor attests it received the batch at its facility.",
  PROCESSED_CLAIMED: "The processor claims processing was done. This is a claim, not proof.",
  VERIFIED: "The assigned independent verifier accepted the processing claim.",
  RETURNED: "The verifier asked for additional evidence; the processor must resubmit with new evidence.",
  REJECTED: "Terminal. The verifier rejected the processing claim.",
  CANCELLED: "Terminal. Withdrawn before collection.",
};

export function isTerminal(state: BatchState): boolean {
  return state === "VERIFIED" || state === "REJECTED" || state === "CANCELLED";
}

/**
 * Review status is NOT a lifecycle stage. A batch in PROCESSED_CLAIMED is
 * simply waiting for the assigned verifier; the on-chain state stays PROCESSED_CLAIMED.
 */
export type ReviewStatus = "Pending verifier review" | "Awaiting resubmission" | "Review complete" | "Not applicable";

export function reviewStatusFor(state: BatchState): ReviewStatus {
  switch (state) {
    case "PROCESSED_CLAIMED":
      return "Pending verifier review";
    case "RETURNED":
      return "Awaiting resubmission";
    case "VERIFIED":
    case "REJECTED":
      return "Review complete";
    default:
      return "Not applicable";
  }
}

/** Valid lifecycle transitions (docs/STATE_MACHINE.md §3). Any other (from, to) pair must not occur. */
export const ALLOWED_TRANSITIONS: Record<BatchState, readonly BatchState[]> = {
  NONE: ["REGISTERED"],
  REGISTERED: ["COLLECTED", "CANCELLED"],
  COLLECTED: ["RECEIVED"],
  RECEIVED: ["PROCESSED_CLAIMED"],
  PROCESSED_CLAIMED: ["VERIFIED", "RETURNED", "REJECTED"],
  RETURNED: ["PROCESSED_CLAIMED"],
  VERIFIED: [],
  REJECTED: [],
  CANCELLED: [],
};

/** Mirrors `enum ReturnReason` in contracts/LoopProofTypes.sol (order checked by tests). */
export const RETURN_REASONS = [
  "NONE",
  "INSUFFICIENT_EVIDENCE",
  "EVIDENCE_UNREADABLE",
  "OUTPUT_DATA_INCOMPLETE",
  "MASS_DISCREPANCY",
] as const;
export type ReturnReason = Exclude<(typeof RETURN_REASONS)[number], "NONE">;

/** Mirrors `enum RejectReason` in contracts/LoopProofTypes.sol (order checked by tests). */
export const REJECT_REASONS = [
  "NONE",
  "EVIDENCE_INCONSISTENT",
  "MASS_BALANCE_IMPLAUSIBLE",
  "PROCESSOR_NOT_QUALIFIED",
  "CHAIN_OF_CUSTODY_BROKEN",
] as const;
export type RejectReason = Exclude<(typeof REJECT_REASONS)[number], "NONE">;

/** Meanings from docs/STATE_MACHINE.md §4a. */
export const REASON_MEANING: Record<ReturnReason | RejectReason, string> = {
  INSUFFICIENT_EVIDENCE: "Evidence does not cover the claimed processing.",
  EVIDENCE_UNREADABLE: "Evidence cannot be opened, read, or matched to its hash.",
  OUTPUT_DATA_INCOMPLETE: "Output set is missing fractions or material codes.",
  MASS_DISCREPANCY: "Output masses need explanation relative to intake.",
  EVIDENCE_INCONSISTENT: "Evidence contradicts the claim or other records.",
  MASS_BALANCE_IMPLAUSIBLE: "Reported outputs are not credible for the intake.",
  PROCESSOR_NOT_QUALIFIED: "Processor facility is not authorized for this material.",
  CHAIN_OF_CUSTODY_BROKEN: "Custody between collection and receipt cannot be established.",
};
