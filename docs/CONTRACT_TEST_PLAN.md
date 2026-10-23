# LoopProof — Contract Test Plan

Source of truth: `docs/STATE_MACHINE.md`. Test IDs are stable; reference them in test names (e.g., `it("[T-AUTH-03] ...")`).

## Status legend

| Status | Meaning |
|--------|---------|
| ✅ **PASSING** | Implemented and observed passing in an actual run. |
| 🟡 **WRITABLE NOW** | Can be written before the contract exists (toolchain, fixtures, pure helpers). Not yet written unless marked ✅. |
| ⛔ **NEEDS CONTRACT** | Requires the Milestone 1 contract. **Not implemented. Not passing.** |

> **Milestone 1 status:** All 185 Mocha tests across `test/toolchain.test.ts` (4), `test/helpers.test.ts` (3), and `test/LoopProofRegistry.test.ts` (178) are implemented and observed passing locally. Passing unit tests confirm adherence to the specification under tested scenarios; they do **not** guarantee complete security or prove that physical recycling occurred.

## Test actors (local Hardhat signers)

`admin`, `registrar`, `registrar2`, `collector`, `collector2`, `processor`, `processor2`, `verifier`, `verifier2`, `outsider` (no roles).

---

## A. Toolchain & helper baseline (no contract deployment required)

| ID | Test | Status |
|----|------|--------|
| T-ENV-01 | Local simulated network reports chainId 31337. | ✅ PASSING |
| T-ENV-02 | At least 5 local signers available for role separation. | ✅ PASSING |
| T-ENV-03 | OpenZeppelin `AccessControl.sol` resolvable from `node_modules`. | ✅ PASSING |
| T-ENV-04 | SHA-256 of `"abc"` matches the standard test vector and is 32 bytes (bytes32-compatible). | ✅ PASSING |
| T-ENV-05 | `contracts/LoopProofTypes.sol` and `contracts/LoopProofRegistry.sol` compile with solc 0.8.28. | ✅ (verified by `hardhat build`, not a Mocha test) |
| T-HLP-01 | Test helper: deterministic unique evidence hash generator (`sha256` of a label) never repeats within a test run. | ✅ PASSING |
| T-HLP-02 | Test helper: claim-key generator produces opaque bytes32 (no raw serials). | ✅ PASSING |
| T-HLP-03 | Mirror check: TypeScript `BatchState`, `ReturnReason`, and `RejectReason` constants match the Solidity enum order. | ✅ PASSING |

---

## B. Contract implementation tests (`test/LoopProofRegistry.test.ts`)

### B0. Deployment & registration validation

| ID | Test | Status |
|----|------|--------|
| — | Constructor grants only `DEFAULT_ADMIN_ROLE` to admin (no lifecycle roles) and starts with `batchCount == 0`. | ✅ PASSING |
| — | Constructor rejects a zero admin address with `ZeroAddress`. | ✅ PASSING |
| T-REG-01 | `registerBatch` stores assignment, category, claim key, and timestamp; emits `BatchRegistered` and `BatchStateChanged`. | ✅ PASSING |
| T-REG-02 | `registerBatch` rejects zero category (`InvalidCategory`). | ✅ PASSING |
| T-REG-03 | `registerBatch` rejects zero collector, processor, or verifier address (`ZeroAddress`). | ✅ PASSING |
| T-REG-04 | `registerBatch` rejects assignees lacking their required role (`AssigneeMissingRole`). | ✅ PASSING |
| T-REG-05 | Processor (and collector/verifier) cannot be changed after registration; no mutator exists (D-15). | ✅ PASSING |

### B1. Authorized and unauthorized actions

| ID | Test | Status |
|----|------|--------|
| T-AUTH-01 | Only `REGISTRAR_ROLE` can `registerBatch`; `outsider`, `collector`, `processor`, `verifier`, and `admin` revert with `AccessControlUnauthorizedAccount`. | ✅ PASSING |
| T-AUTH-02 | Only assigned collector with `COLLECTOR_ROLE` can `recordCollection`; every other role and `outsider` revert. | ✅ PASSING |
| T-AUTH-03 | Only assigned processor with `PROCESSOR_ROLE` can `recordReceipt`; others revert. | ✅ PASSING |
| T-AUTH-04 | Only assigned processor with `PROCESSOR_ROLE` can `submitProcessing`; others revert. | ✅ PASSING |
| T-AUTH-05 | Only assigned verifier with `VERIFIER_ROLE` can `verifyBatch` / `returnBatch` / `rejectBatch`; others revert (3 tests). | ✅ PASSING |
| T-AUTH-06 | Only assigned processor with `PROCESSOR_ROLE` can `resubmitProcessing` after `RETURNED`; others revert. | ✅ PASSING |
| T-AUTH-07 | Only the batch's assigned registrar with `REGISTRAR_ROLE` can `cancelBatch` (D-16/D-17: `admin` reverts with `AccessControlUnauthorizedAccount`, and another registrar `registrar2` reverts with `NotAssignedActor`). | ✅ PASSING |
| T-AUTH-08 | Only `DEFAULT_ADMIN_ROLE` can grant/revoke roles; `outsider` and `registrar` cannot grant roles. | ✅ PASSING |
| T-AUTH-09 | After `COLLECTOR_ROLE` or `VERIFIER_ROLE` (`T-AUTH-09b`) is revoked, the assigned address can no longer perform that action. | ✅ PASSING |
| T-AUTH-10 | Role holders (`collector2`, `processor2`, `verifier2`) who are not the batch's assignee revert with `NotAssignedActor`. | ✅ PASSING |
| T-AUTH-11 | Admin granting itself `REGISTRAR_ROLE` or `VERIFIER_ROLE` still cannot cancel or verify an existing batch registered by another account (`NotAssignedActor`, D-16/D-17). | ✅ PASSING |

### B2. Every valid lifecycle transition

| ID | Test | Status |
|----|------|--------|
| T-TR-01 | `NONE → REGISTERED` via `registerBatch`; `getState` returns `REGISTERED`. | ✅ PASSING |
| T-TR-02 | `REGISTERED → COLLECTED` stores intake mass and evidence hash. | ✅ PASSING |
| T-TR-03 | `REGISTERED → CANCELLED` sets `finalizedAt` and state `CANCELLED`. | ✅ PASSING |
| T-TR-04 | `COLLECTED → RECEIVED` by the locked processor records receipt evidence hash and timestamp. | ✅ PASSING |
| T-TR-05 | `RECEIVED → PROCESSED_CLAIMED` stores output masses and evidence hash as revision 0. | ✅ PASSING |
| T-TR-06 | `PROCESSED_CLAIMED → VERIFIED` sets `finalizedAt` and state `VERIFIED`. | ✅ PASSING |
| T-TR-07 | `PROCESSED_CLAIMED → RETURNED`. | ✅ PASSING |
| T-TR-08 | `PROCESSED_CLAIMED → REJECTED` records reject reason and `finalizedAt`. | ✅ PASSING |
| T-TR-09 | `RETURNED → PROCESSED_CLAIMED` via `resubmitProcessing` with new evidence. | ✅ PASSING |
| T-TR-10 | Full happy path `REGISTERED → COLLECTED → RECEIVED → PROCESSED_CLAIMED → VERIFIED` in one test. | ✅ PASSING |
| T-TR-11 | Multiple batches transition independently of each other. | ✅ PASSING |

### B3. Skipped and invalid transitions

| ID | Test | Status |
|----|------|--------|
| T-INV-01 | `REGISTERED → RECEIVED` (skip collect) reverts with `InvalidTransition`. | ✅ PASSING |
| T-INV-02 | `REGISTERED → PROCESSED_CLAIMED` reverts with `InvalidTransition`. | ✅ PASSING |
| T-INV-03 | `COLLECTED → PROCESSED_CLAIMED` (skip receipt) reverts with `InvalidTransition`. | ✅ PASSING |
| T-INV-04 | `RECEIVED → VERIFIED` (skip claim) reverts with `InvalidTransition`. | ✅ PASSING |
| T-INV-05 | `REGISTERED → VERIFIED` and `COLLECTED → VERIFIED` revert with `InvalidTransition`. | ✅ PASSING |
| T-INV-06 | `cancelBatch` from `COLLECTED`, `RECEIVED`, `PROCESSED_CLAIMED`, and `RETURNED` reverts with `InvalidTransition`. | ✅ PASSING |
| T-INV-07 | Regression attempts (`RECEIVED → COLLECTED`, `PROCESSED_CLAIMED → RECEIVED`) revert with `InvalidTransition`. | ✅ PASSING |
| T-INV-08 | `RETURNED → VERIFIED` directly (without resubmit) reverts with `InvalidTransition`. | ✅ PASSING |
| T-INV-09 | Every lifecycle action and `getBatch` on a non-existent batch (`0`, `2`, `999`) reverts with `UnknownBatch`. | ✅ PASSING |
| T-INV-10 | Parameterized exhaustive 8×8 `(state × action)` matrix: every valid pair succeeds and every unlisted pair reverts with `InvalidTransition` leaving stored batch data unchanged (64 tests). | ✅ PASSING |
| T-INV-11 | `resubmitProcessing` from `PROCESSED_CLAIMED` (without prior return) reverts with `InvalidTransition`. | ✅ PASSING |

### B4. Terminal-state immutability

| ID | Test | Status |
|----|------|--------|
| T-TERM-01 | From `VERIFIED`, every action reverts and stored batch/revision data is unchanged. | ✅ PASSING |
| T-TERM-02 | From `REJECTED`, every action reverts and stored batch/revision data is unchanged. | ✅ PASSING |
| T-TERM-03 | From `CANCELLED`, every action reverts and stored batch/revision data is unchanged. | ✅ PASSING |

### B5. Duplicate claim rejection

| ID | Test | Status |
|----|------|--------|
| T-DUP-01 | Registering the same claim key twice reverts with `DuplicateClaimKey`. | ✅ PASSING |
| T-DUP-02 | Re-registering a claim key of a `CANCELLED` batch reverts with `DuplicateClaimKey`. | ✅ PASSING |
| T-DUP-03 | Re-registering a claim key of a `VERIFIED` or `REJECTED` batch reverts with `DuplicateClaimKey`. | ✅ PASSING |
| T-DUP-04 | Zero claim key (`bytes32(0)`) reverts with `ZeroClaimKey`. | ✅ PASSING |
| T-DUP-05 | A second registrar also cannot reuse an existing claim key (`DuplicateClaimKey`). | ✅ PASSING |

### B6. Evidence-hash reuse rejection

| ID | Test | Status |
|----|------|--------|
| T-EVD-01 | Same evidence hash used for `recordCollection` then `recordReceipt` on the same batch reverts with `EvidenceAlreadyUsed`. | ✅ PASSING |
| T-EVD-02 | Evidence hash used on batch A is rejected on batch B (`EvidenceAlreadyUsed`). | ✅ PASSING |
| T-EVD-03 | `resubmitProcessing` after `RETURNED` with the original processing evidence hash reverts (`EvidenceAlreadyUsed`). | ✅ PASSING |
| T-EVD-04 | `bytes32(0)` evidence hash reverts with `MissingEvidence` at every evidence-bearing stage. | ✅ PASSING |
| T-EVD-05 | A failed (reverted) call does not mark its evidence hash as used. | ✅ PASSING |

### B7. Processor/collector self-verification rejection (verifier independence)

> **Verified check ordering:** The runtime defense-in-depth check in `_verifierPreconditions` is prioritized before `_requireAssigned`. Any attempt by an assigned collector or processor holding `VERIFIER_ROLE` to call `verifyBatch`, `returnBatch`, or `rejectBatch` explicitly reverts with `VerifierNotIndependent(actor)` rather than a generic `NotAssignedActor`. Unassigned third-party verifiers continue to revert with `NotAssignedActor`.

| ID | Test | Status |
|----|------|--------|
| T-IND-01 | Address holding both `PROCESSOR_ROLE` and `VERIFIER_ROLE` cannot be registered as verifier for its own batch (`VerifierNotIndependent` at registration) and cannot verify an existing batch it processed (`VerifierNotIndependent` at `_verifierPreconditions`). | ✅ PASSING |
| T-IND-02 | Address holding both `COLLECTOR_ROLE` and `VERIFIER_ROLE` cannot be registered as verifier for its own batch (`VerifierNotIndependent` at registration) and cannot verify an existing batch it collected (`VerifierNotIndependent` at `_verifierPreconditions`). | ✅ PASSING |
| T-IND-03 | Same independence check (`VerifierNotIndependent`) blocks self-`returnBatch` and self-`rejectBatch` by processor or collector on an existing batch. | ✅ PASSING |
| T-IND-04 | A distinct assigned `verifier` can verify the batch (positive control). | ✅ PASSING |
| T-IND-05 | Collector and processor may be the same address, provided the verifier is distinct. | ✅ PASSING |

### B8. Mass-balance validation

| ID | Test | Status |
|----|------|--------|
| T-MASS-01 | `recordCollection` with intake mass 0 reverts with `ZeroIntakeMass`. | ✅ PASSING |
| T-MASS-02 | Outputs summing to exactly intake mass succeed. | ✅ PASSING |
| T-MASS-03 | Outputs summing to less than intake mass succeed (losses allowed). | ✅ PASSING |
| T-MASS-04 | Outputs summing to `intake + 1` gram revert with `MassBalanceExceeded`. | ✅ PASSING |
| T-MASS-05 | Mass-balance is enforced again on `resubmitProcessing`. | ✅ PASSING |
| T-MASS-06 | Max-scale (`uint128` max × 16 outputs) values revert cleanly with `MassBalanceExceeded` without arithmetic overflow. | ✅ PASSING |
| T-MASS-07 | Empty output array reverts with `NoOutputs`. | ✅ PASSING |
| T-MASS-08 | More than `MAX_OUTPUTS` (16) outputs revert with `TooManyOutputs`. | ✅ PASSING |
| T-MASS-09 | Zero material code or zero output mass reverts with `InvalidOutput(index)`. | ✅ PASSING |

### B9. `RETURNED` resubmission path, revision history, and reason codes

| ID | Test | Status |
|----|------|--------|
| T-RET-01 | Verifier `returnBatch` sets `RETURNED`, stores `lastReturnReason` and per-revision `returnReason`, and emits `BatchReturned`. | ✅ PASSING |
| T-RET-02 | Processor `resubmitProcessing` with new evidence replaces current outputs while preserving previous revision data and outputs (D-13). | ✅ PASSING |
| T-RET-03 | Resubmit reusing earlier batch evidence hash reverts with `EvidenceAlreadyUsed`. | ✅ PASSING |
| T-RET-04 | Multiple return/resubmit cycles succeed when each uses fresh evidence, preserving each revision's return reason. | ✅ PASSING |
| T-RET-05 | After resubmit, verifier `verifyBatch` transitions to `VERIFIED` referencing the latest revision index and hash. | ✅ PASSING |
| T-RET-06 | `getRevision` out of range reverts with `UnknownRevision(batchId, revision)`; `getCurrentOutputs` returns empty array before any submission. | ✅ PASSING |
| T-RSN-01 | `returnBatch` with `ReturnReason.NONE (0)` reverts with `InvalidReasonCode` (D-14). | ✅ PASSING |
| T-RSN-02 | `rejectBatch` with `RejectReason.NONE (0)` reverts with `InvalidReasonCode` (D-14). | ✅ PASSING |
| T-RSN-03 | Out-of-range reason code values revert on ABI decoding. | ✅ PASSING |
| T-RSN-04 | Each documented `ReturnReason` (codes 1–4) is accepted, stored, and emitted (4 tests). | ✅ PASSING |
| T-RSN-05 | Each documented `RejectReason` (codes 1–4) is accepted, stored, and emitted (4 tests). | ✅ PASSING |

### B10. Verification and event emission

| ID | Test | Status |
|----|------|--------|
| T-EVT-01 | Every transition emits `BatchStateChanged` with `batchId`, `fromState`, `toState`, `actor`, and `evidenceHash`. | ✅ PASSING |
| T-EVT-02 | Reverted calls emit no events. | ✅ PASSING |
| T-EVT-03 | Contract ABI has no `string` or dynamic `bytes` inputs in any function or event (prevents raw serial / free-text PII fields). | ✅ PASSING |
| T-EVT-04 | `BatchVerified` event records a verifier address distinct from both collector and processor. | ✅ PASSING |
| T-EVT-05 | Full batch transition history and revision outputs can be reconstructed from emitted events alone. | ✅ PASSING |

### B11. Adversarial & Security Invariant Hardening

| ID | Test | Status |
|----|------|--------|
| T-ADV-REG-01 | Revoking `REGISTRAR_ROLE` from the batch's registrar prevents cancellation (`AccessControlUnauthorizedAccount`). | ✅ PASSING |
| T-ADV-REG-02 | Mutual registrar isolation: `registrar1` cannot cancel `registrar2`'s batch and vice versa (`NotAssignedActor`). | ✅ PASSING |
| T-ADV-REG-03 | Admin granting itself `REGISTRAR_ROLE` cannot cancel any existing registered batch (`NotAssignedActor`). | ✅ PASSING |
| T-ADV-REG-04 | Assigned registrar cannot cancel once collection has occurred (`InvalidTransition`). | ✅ PASSING |
| T-ADV-REG-05 | Claim key of a cancelled batch cannot be re-registered (`DuplicateClaimKey`). | ✅ PASSING |
| T-ADV-IND-01 | Conflicted collector with `VERIFIER_ROLE` reverts with `VerifierNotIndependent` at `verifyBatch`. | ✅ PASSING |
| T-ADV-IND-02 | Conflicted processor with `VERIFIER_ROLE` reverts with `VerifierNotIndependent` at `verifyBatch`. | ✅ PASSING |
| T-ADV-IND-03 | Conflicted collector or processor cannot return or reject their own batch (`VerifierNotIndependent`). | ✅ PASSING |
| T-ADV-IND-04 | Third-party non-conflicted verifier reverts with `NotAssignedActor` (distinguishing role authorization from conflict-of-interest rejection). | ✅ PASSING |
| T-ADV-IND-05 | Integrated facility (`collector == processor`) is permitted provided the verifier is distinct; self-verification reverts with `VerifierNotIndependent`. | ✅ PASSING |
| T-ADV-EVD-01 | Cross-stage digest reuse within the same batch reverts (`EvidenceAlreadyUsed`). | ✅ PASSING |
| T-ADV-EVD-02 | Digest used in terminal batch (`VERIFIED`, `REJECTED`, `CANCELLED`) cannot be reused on a new batch (`EvidenceAlreadyUsed`). | ✅ PASSING |
| T-ADV-EVD-03 | Digest from revision 0 cannot be reused in revision 2 after multiple returns (`EvidenceAlreadyUsed`). | ✅ PASSING |
| T-ADV-EVD-04 | `bytes32(0)` is rejected across all evidence entry points (`MissingEvidence`). | ✅ PASSING |
| T-ADV-TR-01 | Skipping stages from `REGISTERED` directly to later states reverts (`InvalidTransition`). | ✅ PASSING |
| T-ADV-TR-02 | Premature verification before processing claim reverts (`InvalidTransition`). | ✅ PASSING |
| T-ADV-TR-03 | Backward transitions are strictly forbidden (`InvalidTransition`). | ✅ PASSING |
| T-ADV-TR-04 | Terminal states `VERIFIED`, `REJECTED`, `CANCELLED` accept no mutations (`InvalidTransition`). | ✅ PASSING |
| T-ADV-MASS-01 | Output summing to `intake + 1` gram reverts with `MassBalanceExceeded`. | ✅ PASSING |
| T-ADV-MASS-02 | 17 outputs exceeds `MAX_OUTPUTS` and reverts with `TooManyOutputs`. | ✅ PASSING |
| T-ADV-MASS-03 | Zero mass or zero material code at any position reverts with `InvalidOutput`. | ✅ PASSING |
| T-ADV-MASS-04 | Exact mass conservation (`sum == intake`) succeeds. | ✅ PASSING |
| T-ADV-MASS-05 | Sub-intake mass claim (`sum < intake`) succeeds representing physical loss. | ✅ PASSING |

---

## Out of scope for contract tests

Impact calculation, AI classification, UI, database, and testnet deployment. Impact gating (STATE_MACHINE rule 8) is enforced off-chain and will be tested in a later milestone.
