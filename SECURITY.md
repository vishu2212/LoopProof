# Security Policy

## Scope & Prototype Classification

LoopProof is a hackathon prototype designed for the IEEE ClimateChain Global Hackathon 2026 (Sustainable Supply Chains track). It has been tested with automated test suites across both tracks of its dual-track architecture:
- **Web & Database Track:** Next.js 16 + Supabase PostgreSQL RLS + Private Storage (57 passing web tests, 53 passing local database pgTAP tests).
- **Protocol Reference Track:** Solidity 0.8.28 reference smart contract suite on local Hardhat EVM (188 passing unit and adversarial tests).

A successful test suite does not establish that the application or its smart contracts are free of vulnerabilities, nor has the repository undergone a formal independent third-party audit.

Please do not upload real personal data, device serial numbers, confidential evidence, production credentials, or private keys to demo records, test runs, or public issue reports.

---

## Reporting a Vulnerability

Please do not publish exploitable vulnerability details or proof-of-concept exploits in public issues or discussions.

If GitHub's **Private vulnerability reporting** feature is enabled for this repository, please report via **Security → Advisories → Report a vulnerability**. Otherwise, contact the repository maintainer privately through the verified contact channels listed on their GitHub profile to request a secure disclosure channel.

Include the affected component, commit hash, vulnerability classification, reproduction steps, and suggested remediation. Redact any credentials, personal information, and proprietary data.

---

## Dual-Track Architecture & Operational Boundaries

LoopProof maintains a strict separation between its two distinct execution environments:

1. **Live Registry Track (Supabase + Next.js):**
   - The production demo application (`https://loop-proof.vercel.app/`) executes against Supabase PostgreSQL and private Supabase Storage (`evidence` bucket).
   - Authorization is enforced by PostgreSQL Row Level Security (RLS) policies scoped by `auth.uid()`, trigger-guarded state machines, append-only event logs, and `SECURITY DEFINER` functions with fixed empty search paths (`search_path = ''`).
   - Server Actions enforce client pre-buffering (20 MB bound), magic-byte MIME type validation (PDF, JPEG, PNG only), and server-calculated SHA-256 digests.
   - **Evidence Integrity & Threat Boundary:** In the live web workflow, Next.js Server Actions buffer evidence files in memory, compute a 32-byte SHA-256 digest, upload the file with digest metadata, and pass the digest to PostgreSQL lifecycle RPCs. Database triggers and functions verify that the declared digest, file size, MIME type, and batch folder match `storage.objects` metadata and that the caller is the recorded object uploader. However, because Supabase Storage allows authenticated uploaders to provide custom `user_metadata`, and because PostgREST currently exposes lifecycle RPCs directly to `authenticated` users, the database enforces *Storage metadata consistency* rather than an independent end-to-end proof of binary file-byte integrity. An authenticated user calling the PostgREST API directly could upload arbitrary file bytes with matching metadata.
   - **Operational Boundary:** The live registry is backed by PostgreSQL; it is **not** anchored to, synced with, or recorded on any public blockchain.

2. **Protocol Reference Track (Solidity 0.8.28 on Local Hardhat EVM):**
   - The smart contract suite (`contracts/LoopProofRegistry.sol`, `contracts/LoopProofTypes.sol`) serves as a formal on-chain reference implementation of the lifecycle finite state machine.
   - It is tested and verified locally on the simulated Hardhat EVM network (`chainId 31337`) across 188 passing automated test cases.
   - **Operational Boundary:** The smart contracts are **not deployed to any public testnet or mainnet**. The Solidity contract records 32-byte evidence digests submitted by authorized callers, enforces global uniqueness (`evidenceUsed` mapping), and rejects zero-hashes, but has no direct access to off-chain binary files.

---

## Verified Protocol Invariants & Security Mitigations

### 1. Separation of Duties, Admin Boundaries, & Access Control
- **OpenZeppelin Role Management:** Uses standard OpenZeppelin `AccessControl`.
- **Administrative Boundary (D-16):** An account holding *only* `DEFAULT_ADMIN_ROLE` possesses **zero direct lifecycle authority**. It cannot call `registerBatch`, `recordCollection`, `recordReceipt`, `submitProcessing`, `resubmitProcessing`, `verifyBatch`, `returnBatch`, `rejectBatch`, or `cancelBatch`; all direct lifecycle calls revert with `AccessControlUnauthorizedAccount`. There are no emergency overrides or backdoor mutation functions.
- **Role-Granting Capability:** As the role admin, `DEFAULT_ADMIN_ROLE` can grant any lifecycle role (`REGISTRAR_ROLE`, `COLLECTOR_ROLE`, `PROCESSOR_ROLE`, `VERIFIER_ROLE`) to any address, including to itself.
- **Per-Batch Assignment Isolation on Existing Batches (D-15, D-17):** Holding a lifecycle role is a necessary but not sufficient condition to act on an existing batch. Every lifecycle transition strictly enforces `_requireAssigned(batchId, assignee)`. Assignees (`registrar`, `collector`, `processor`, `verifier`) are permanently locked at batch registration and cannot be modified. Even if the admin grants itself all lifecycle roles, it **cannot** act on, advance, or cancel any existing batch registered by or assigned to another account (reverting with `NotAssignedActor`).
- **Residual Trust & Governance Risks:**
  - *New Batches (Collusion/Sybil Risk):* The admin can grant lifecycle roles to distinct addresses under its control (or colluding entities) to register and progress *brand new* batches through the lifecycle to `VERIFIED`. Verifier independence enforces address separation, but cannot detect off-chain collusion between Sybil accounts.
  - *Existing Batches (Liveness/DoS Risk):* While the admin cannot alter or cancel existing batches, it can revoke roles from assigned actors, blocking pending actions on in-flight batches (e.g. revoking `COLLECTOR_ROLE` blocks collection; revoking `VERIFIER_ROLE` blocks verification). Admin key custody remains a fundamental operational trust assumption.

### 2. Registrar Cancellation Authorization
- **Cancellation Window:** Gated strictly to `REGISTERED` state (before physical collection).
- **Assigned Registrar Check:** Only the exact account (`b.registrar`) that registered the batch may cancel it. Admin and other registrars receive `NotAssignedActor`.
- **Role Revocation Invariant:** If `REGISTRAR_ROLE` is revoked from `b.registrar`, cancellation is immediately blocked (`AccessControlUnauthorizedAccount`).
- **Mutual Registrar Isolation:** Multiple active registrars operate in complete isolation; neither can cancel batches registered by the other.
- **Terminal State Lock:** Once cancelled, a batch cannot be transitioned or mutated, and its claim key remains permanently consumed.

### 3. Verifier Independence & Conflict-of-Interest Prevention
- **Registration-Time Gating:** `registerBatch` strictly enforces `verifier != collector` and `verifier != processor`, reverting with `VerifierNotIndependent(verifier)`.
- **Runtime Defense-in-Depth:** In `_verifierPreconditions`, the independence check is prioritized before assignee checks. If an account assigned as collector or processor holds `VERIFIER_ROLE` and attempts to call `verifyBatch`, `returnBatch`, or `rejectBatch`, the transaction reverts explicitly with `VerifierNotIndependent(actor)` rather than a generic unassigned error.
- **Third-Party Disambiguation:** An unassigned third-party verifier reverts with `NotAssignedActor`, cleanly differentiating assignment failure from conflict of interest.
- **Integrated Facilities:** While collector and processor may share an address (e.g. integrated recovery facility), the verifier must remain distinct and independent.

### 4. Evidence-Digest Uniqueness & Replay Protection
- **Global Digest Registry:** `evidenceUsed` mapping tracks all consumed SHA-256 evidence digests across the entire contract.
- **Cross-Stage & Cross-Batch Isolation:** An evidence digest cannot be reused across different stages of the same batch or across different batches (including batches in terminal states `VERIFIED`, `REJECTED`, or `CANCELLED`).
- **Revision Progression:** Re-submitting after `RETURNED` requires fresh, previously unused evidence digests. Old revision digests cannot be re-anchored.
- **Zero-Hash Rejection:** `bytes32(0)` is rejected across all evidence-bearing entry points with `MissingEvidence`.

### 5. Conservation of Mass & Arithmetic Safety
- **Mass-Balance Constraint:** $\sum \text{OutputMass} \le \text{IntakeMass}$ at integer gram precision. Submissions with $\sum \text{OutputMass} > \text{IntakeMass}$ (even by 1 gram) revert with `MassBalanceExceeded`.
- **Output Fraction Limits:** Maximum 16 output fractions per revision (`MAX_OUTPUTS`). Zero mass or zero material code at any fraction reverts with `InvalidOutput`.
- **Arithmetic Safety:** Output masses (`uint128`) are summed into a `uint256` accumulator. At at most 16 outputs of `type(uint128).max`, the sum cannot overflow $2^{256} - 1$, preventing integer overflow panics.
- **Legitimate Physical Losses:** Output masses strictly less than intake mass are accepted, transparently modeling physical recycling losses.

### 6. Reentrancy Analysis
- `LoopProofRegistry.sol` performs zero external contract calls, holds no native ether, implements no fallback/receive functions, and interacts with no ERC-20/ERC-721 tokens.
- All state modifications occur on internal storage mappings. Reentrancy vulnerabilities are therefore non-applicable to this contract design.

---

## What the System Does — and Does Not — Prove

| Property | Demonstrates | Does NOT Demonstrate |
| :--- | :--- | :--- |
| **Cryptographic Evidence Digest** | Confirms declared RPC arguments match uploaded Storage object metadata (live registry); enforces digest uniqueness and replay prevention on-chain (reference contract). | Does not independently re-hash binary bytes from object storage inside PostgreSQL; does not prevent an authenticated direct API caller from providing matching metadata for arbitrary bytes; does not prove the off-chain document is truthful, accurate, or physically genuine. |
| **State Machine Transitions** | Proves authorized private keys (contracts) or authenticated accounts (PostgreSQL) recorded lifecycle events in accordance with protocol rules. | Does not prove physical movement, receipt, or recycling occurred in the real world. |
| **Verifier Independence** | Proves verifying key/identity differs from collector and processor keys/identities. | Does not prove off-chain corporate entities are economically or legally independent. |
| **Conservation of Mass** | Enforces that reported mathematical sums do not exceed intake mass on record. | Does not prevent fraudulent scale readings or misreported intake weights. |
| **Environmental Impact Gating** | Prevents premature display of impact metrics until verified and supported by cited factors. | Does not guarantee that verified recycled material yields net carbon reduction without life-cycle analysis. |

---

## Known Assumptions & Limitations

- **Administrative Key Custody:** `DEFAULT_ADMIN_ROLE` can grant lifecycle roles to colluding accounts to create and advance *new* batches, or revoke roles to stall pending batches. Admin key security is a fundamental operational assumption.
- **Evidence Storage & Byte-Integrity Boundary (Live Registry):** In the current live deployment, PostgreSQL validates Storage metadata consistency (`size`, `mimetype`, `user_metadata->>'sha256'`) and uploader ownership; it does not compute the digest directly from raw object storage bytes. Because lifecycle RPCs permit direct PostgREST calls by `authenticated` users, true end-to-end byte integrity relies on the Next.js Server Action execution path. Full database-level enforcement would require restricting lifecycle RPC execution to `service_role`.
- **Single Intake Reading:** Intake mass is recorded once at collection; processor receipt does not record a separate tare/gross scale reading.
- **Synthetic Fixtures:** Dashboard fixtures (`DEMO-NNN`) are synthetic demonstrative examples. They must never be represented as real-world recycling evidence.
