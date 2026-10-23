# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Enterprise Sustainability Officers & Compliance Auditors**: Review verified circularity records, track chain-of-custody integrity, and audit material recovery metrics for regulatory ESG filings.
- **Collection Partners (Collectors)**: Record physical intake mass and upload cryptographically hashed intake documentation.
- **Material Processors**: Acknowledge physical receipt of collected batches, submit itemized recovery/fraction claims, and handle return/resubmission cycles.
- **Independent Third-Party Verifiers**: Conduct rigorous checklist audits and mass-balance reconciliation without conflicts of interest (cannot verify batches they collected or processed).

## Product Purpose

LoopProof is an evidence-gated e-waste traceability platform that eliminates greenwashing in circular supply chains. It replaces self-reported ESG assertions with cryptographically grounded custody handoffs, immutable mass-balance reconciliation, and independent verification gating.

## Positioning

**“Collected does not mean recycled.”**
Unlike legacy circularity portals that award carbon credits or green badges upon pickup, LoopProof enforces that physical collection and receipt are merely intermediate custody events. Environmental impact claims remain strictly locked and undisclosed until an independent verifier validates evidence documents and confirms output mass balance.

## Operating Context

- **Multi-Stakeholder Supply Chain**: Heterogeneous actors across waste collection hubs, sorting facilities, specialized metallurgical recyclers, and independent auditing firms.
- **High-Stakes Compliance**: Used during corporate ESG audits, ISO 14001 certification, and WEEE directive compliance reviews where false claims carry legal and reputational penalties.
- **Dual-Track Implementation**:
  - **Live Web Registry**: Built with Next.js and Supabase. Evidence files (PDFs, weighbridge tickets, assay reports) are stored in private Supabase Storage. The Next.js application computes a 32-byte SHA-256 digest from the uploaded file bytes, PostgreSQL records it, and the database checks digest metadata consistency against Storage object metadata. Because Storage object metadata is caller-supplied and authenticated lifecycle RPCs are directly callable via PostgREST, this enforces metadata consistency rather than an independent end-to-end byte-integrity guarantee. The live Supabase registry is not claimed to be anchored to a public blockchain.
  - **Solidity Smart Contract Reference Engine**: `contracts/LoopProofRegistry.sol` implements the protocol finite state machine with role-based access, mass-balance validation, and typed reason codes, tested locally on Hardhat EVM (`chainId 31337`) across 188 automated tests.

## Capabilities and Constraints

- **Five Canonical Lifecycle Stages**: `REGISTERED` → `COLLECTED` → `RECEIVED` → `PROCESSED_CLAIMED` → `VERIFIED`.
- **Three Exception / Alternative States**: `RETURNED` (actionable by processor with reason code), `REJECTED` (terminal failure with reason code), `CANCELLED` (pre-collection cancellation by registrar).
- **Strict Mass-Balance Validation**: Total claimed output fractions must not exceed recorded intake mass ($Output \le Intake$).
- **Actor Independence**: Collectors and processors cannot verify their own batches.
- **Contract-Bound Reason Codes**: Verification returns and rejections strictly bind to predefined enums (`INSUFFICIENT_EVIDENCE`, `EVIDENCE_UNREADABLE`, `OUTPUT_DATA_INCOMPLETE`, `MASS_DISCREPANCY`, `EVIDENCE_INCONSISTENT`, `MASS_BALANCE_IMPLAUSIBLE`, `PROCESSOR_NOT_QUALIFIED`, `CHAIN_OF_CUSTODY_BROKEN`) defined in the Solidity reference specification and mirrored in the Supabase schema.
- **Clear Execution Environments**: Strict separation and disclosure between offline synthetic demo fixtures, the live Supabase-backed registry, and the locally simulated Hardhat EVM reference contracts.

## Brand Commitments

- **Visual Archetype**: Premium Enterprise SaaS × Evidence Ledger × Circular Industry.
- **Palette Tokens**: Deep Forest Green (`#143823`), Warm Ivory (`#FAF9F5`), Carbon Ink (`#1A1C1B`), Ochre (`#A86F1D`), Oxide Red (`#8F261B`), Hairline Border (`#DBD4C4`), Subtle Divider (`#E8E2D5`).
- **Tone**: Rigorous, archival, authoritative, restrained. 80% enterprise clarity, 20% physical depth/elevation. Zero generic gradients or ungrounded green badges.

## Evidence on Hand

- Canonical synthetic demo fixtures: `DEMO-001` through `DEMO-007` covering every lifecycle state and transition branch.
- Validated mass balance metrics: 50.6 kg total registered intake mass, 24.5 kg in-transit/received, 10.0 kg pending claim review, 8.8 kg independently verified.
- Smart contract reference engine in `contracts/LoopProofRegistry.sol` verified locally by 188 unit and adversarial tests on Hardhat EVM (`chainId 31337`).
- Supabase SQL core schema migration with RLS policies, trigger guards, and `SECURITY DEFINER` RPCs.
- Live web application deployed on Vercel with route-aware context disclosures.

## Product Principles

1. **Collected does not mean recycled**: Pickup certificates prove location handover, not physical recycling.
2. **Hashes record digest declarations, not independent byte proof or process truth**: The application computes a SHA-256 digest from uploaded bytes and the database enforces Storage metadata consistency. Because authenticated clients can supply Storage metadata and call lifecycle RPCs directly, this is not yet an independent end-to-end byte-integrity guarantee. Furthermore, no cryptographic hash can prove the physical truth or genuineness of off-chain recycling processes, which requires independent verifier corroboration.
3. **Strict impact gating**: No environmental impact numbers, avoided emissions, or carbon offsets are displayed before independent verification.
4. **Transparent custody & accountability**: Every state change records the actor identifier, timestamp, evidence digest, and immutable reason codes. The live registry stores these in PostgreSQL under Row Level Security, while the smart contract demonstrates protocol enforcement on EVM.

## Accessibility & Inclusion

- Adherence to WCAG 2.1 AA contrast requirements across both dark green sidebar elements and ivory/white workspace cards.
- Statuses conveyed with text labels and semantic icons, never color alone.
- Full keyboard navigation with visible focus rings (`#143823` on light surfaces, `#A3CFB3` on dark surfaces).
- Full `prefers-reduced-motion` compliance.
