// Pure test helpers (no network side effects).
import { keccak256, sha256, toUtf8Bytes } from "ethers";

/** Mirrors `enum BatchState` in contracts/LoopProofTypes.sol (checked by T-HLP-03). */
export const State = {
  NONE: 0n,
  REGISTERED: 1n,
  COLLECTED: 2n,
  RECEIVED: 3n,
  PROCESSED_CLAIMED: 4n,
  VERIFIED: 5n,
  RETURNED: 6n,
  REJECTED: 7n,
  CANCELLED: 8n,
} as const;
export type StateName = keyof typeof State;

/** Mirrors `enum ReturnReason`. */
export const ReturnReason = {
  NONE: 0n,
  INSUFFICIENT_EVIDENCE: 1n,
  EVIDENCE_UNREADABLE: 2n,
  OUTPUT_DATA_INCOMPLETE: 3n,
  MASS_DISCREPANCY: 4n,
} as const;

/** Mirrors `enum RejectReason`. */
export const RejectReason = {
  NONE: 0n,
  EVIDENCE_INCONSISTENT: 1n,
  MASS_BALANCE_IMPLAUSIBLE: 2n,
  PROCESSOR_NOT_QUALIFIED: 3n,
  CHAIN_OF_CUSTODY_BROKEN: 4n,
} as const;

export const ZERO_HASH = "0x" + "00".repeat(32);
export const MAX_UINT128 = (1n << 128n) - 1n;

let evidenceCounter = 0;
/** Unique SHA-256 evidence hash per call (stands in for hashing an off-chain file). */
export function newEvidence(label = "evidence"): string {
  evidenceCounter += 1;
  return sha256(toUtf8Bytes(`loopproof-test:${label}:${evidenceCounter}`));
}

let claimCounter = 0;
/**
 * Opaque bytes32 claim key, as would be computed off-chain from a salted internal ID.
 * The raw label never leaves this function.
 */
export function newClaimKey(label = "claim"): string {
  claimCounter += 1;
  return keccak256(toUtf8Bytes(`salt:test-only:${label}:${claimCounter}`));
}

export type Output = { materialCode: number; massGrams: bigint };
export const out = (materialCode: number, massGrams: bigint): Output => ({ materialCode, massGrams });
