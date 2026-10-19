# LoopProof — Decision Record

> **Product principle:** *Collected does not mean recycled. Environmental impact must not be claimed until the required evidence exists.*

Status legend: **LOCKED** = changing it requires an explicit, dated amendment entry below.

| ID | Decision | Status |
|----|----------|--------|
| D-01 | **Track:** Sustainable Supply Chains (primary track). | LOCKED |
| D-02 | **Chain:** one EVM testnet only. Test **Base Sepolia** first. Use **Polygon Amoy** only if the Base Sepolia RPC, faucet, or block explorer fails verification. The choice and the reason are recorded here before deployment. | LOCKED |
| D-03 | **Local first:** the contract must be tested locally (Hardhat simulated network) before any testnet deployment. | LOCKED |
| D-04 | **Evidence off-chain:** evidence files stay off-chain. Only SHA-256 hashes and the required lifecycle records may be anchored on-chain. | LOCKED |
| D-05 | **Never on-chain:** raw serial numbers, personal data, private evidence, and API keys must never be published on-chain (including in events, calldata, or revert strings). | LOCKED |
| D-06 | **AI is advisory:** AI classification is a suggestion only. A human must confirm the device category. | LOCKED |
| D-07 | **AI has no authority:** AI must have no authority to approve a batch or verify recycling. No AI-controlled key holds any lifecycle role. | LOCKED |
| D-08 | **No early impact numbers:** no numerical environmental impact estimate is shown, stored, or exported before independent verification (`VERIFIED`). | LOCKED |
| D-09 | **MVP exclusions:** no tokens, NFTs, DAO, carbon credits, or multi-chain support. | LOCKED |
| D-10 | **Custodial demo keys disclosure:** if backend-managed role keys are used for the demo, this must be disclosed as a prototype limitation. Such signatures do **not** prove that the named organization personally signed. | LOCKED |
| D-11 | **Submission window:** October 5, 2026, 9:30 AM IST → **October 25, 2026, 7:30 PM IST**, as supplied from the official rules. | LOCKED — **confirmed by project owner** |
| D-12 | **Separate registrar:** batch registration requires a dedicated `REGISTRAR_ROLE`. Collectors cannot register batches by virtue of `COLLECTOR_ROLE`. | LOCKED (2026-10-19, M1) |
| D-13 | **Resubmission replaces outputs, preserves history:** a resubmission after `RETURNED` replaces the *current* complete output set. Every previous revision (its evidence hash, outputs, total mass, timestamp, and return reason) remains stored and queryable. | LOCKED (2026-10-19, M1) |
| D-14 | **Explicit reason codes:** `return` and `reject` require an explicit, non-zero reason code from the documented lists in `STATE_MACHINE.md` §4a. There is no free-text or catch-all "OTHER" code. | LOCKED (2026-10-19, M1) |
| D-15 | **Processor locked at registration:** the processor is assigned when the batch is registered and cannot be changed for the life of the batch. Collector and verifier are also assigned at registration and are likewise immutable. | LOCKED (2026-10-19, M1) |
| D-16 | **Admin cannot act in the lifecycle:** `DEFAULT_ADMIN_ROLE` only manages role membership. It cannot register, collect, receive, submit, verify, return, reject, or cancel. Cancellation is performed by `REGISTRAR_ROLE` only (this narrows the earlier "Registrar (or admin)" wording in `STATE_MACHINE.md`). | LOCKED (2026-10-19, M1) |
| D-17 | **Per-batch assignment + role:** each lifecycle action requires *both* the relevant role at call time *and* being the address assigned to that batch. Revoking a role immediately blocks that address's pending actions. | LOCKED (2026-10-19, M1) |

## Notes

- **D-11:** The window above is recorded exactly as provided by the project owner from the official rules. It has not been independently reinterpreted or converted.
- **D-04 / D-05:** Where an identifier must be correlated on-chain (e.g., a device serial), only a salted hash or an opaque internal ID may be used; the raw value and salt remain off-chain.
- **Scope of blockchain claims:** on-chain records demonstrate *that actions were recorded by authorized keys and that data has not been altered since anchoring*. They do **not** prove that physical recycling occurred. See `docs/STATE_MACHINE.md`.

## Toolchain (Milestone 0, informational — not a locked decision)

- Hardhat 3.20.0 (TypeScript, ESM) with `@nomicfoundation/hardhat-toolbox-mocha-ethers` (Mocha + Chai + ethers v6).
- Solidity 0.8.28; OpenZeppelin Contracts 5.6.x.
- Secrets supplied via `configVariable()` (process env or Hardhat keystore); never committed.

## Amendments

Format: `YYYY-MM-DD — D-xx — change — reason — approved by`.

- 2026-10-19 — D-12, D-13, D-14, D-15 — added — Milestone 1 instructions resolving STATE_MACHINE §6 open questions — project owner.
- 2026-10-19 — D-16, D-17 — added — derived from Milestone 1 instructions ("admin privileges must not bypass lifecycle authorization"; "assigned collector, processor, and verifier" at registration). Narrows cancel authority from "Registrar (or admin)" to Registrar only. Lifecycle states and transitions are unchanged — pending project-owner review.
