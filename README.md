# LoopProof

**Evidence-gated e-waste traceability for sustainable supply chains.** Built for the IEEE ClimateChain Global Hackathon 2026 — Sustainable Supply Chains track.

> **Collected does not mean recycled. Environmental impact must not be claimed until the required evidence exists.**

LoopProof models an e-waste batch through explicit custody and review stages, separates processing claims from independently verified outcomes, and keeps evidence hashes distinct from the evidence files themselves.

- **Live web app:** https://loop-proof.vercel.app/
- **Source repository:** https://github.com/vishu2212/LoopProof
- **Track:** Sustainable Supply Chains

## The problem

E-waste collection, facility receipt, processing claims, and verified processing are often collapsed into a single sustainability claim. That makes it difficult for downstream buyers, auditors, and the public to distinguish a recorded handoff from a substantiated environmental outcome.

## What LoopProof does

- Records batch registration and assigned collector, processor, and independent verifier roles.
- Models a lifecycle with explicit state transitions: `REGISTERED → COLLECTED → RECEIVED → PROCESSED_CLAIMED → VERIFIED`.
- Supports alternative outcomes such as `RETURNED`, `REJECTED`, and `CANCELLED`; these are not canonical lifecycle stages.
- Stores evidence metadata and SHA-256 digests while keeping uploaded evidence in private storage.
- Enforces role- and state-aware actions through Supabase Auth, PostgreSQL functions, and Row Level Security.
- Checks processing mass totals against intake. A balanced claim must not be returned with `MASS_DISCREPANCY`.
- Gates environmental impact display: no impact estimate is shown before `VERIFIED`; verification alone is not enough without complete evidence and cited factors.
- Keeps the human responsible for confirming the e-waste category; any AI assistance is advisory, not proof.

## Demo and implementation status

The project contains a Next.js web app, a Supabase-backed live workflow, and Solidity contracts with a local test suite.

**The live Supabase workflow and the Solidity contracts are separate parts of this prototype. The Solidity contracts have been tested locally; do not assume they are deployed to a public testnet.** The live web workflow currently records lifecycle actions in Supabase. A database record or evidence hash proves what the system recorded, not that physical collection or recycling actually occurred.

The demo dashboard and its seven sample batches are synthetic. The live registry uses the configured Supabase project. Synthetic test records used during development are not evidence of real-world recycling or environmental impact.

### Current validation

The latest recorded local checks passed:

- Solidity tests: 162 passing.
- Web tests: 55 passing.
- TypeScript typecheck: passed.
- Next.js production build: passed.

These are development checks, not a claim of an independent security audit or full production readiness. The live lifecycle was exercised manually through registration, collection, receipt, and processing claim. The verifier mass-discrepancy guard was added as a database migration; further independent end-to-end verification may still be needed.

## Architecture

- **Web:** Next.js, React, TypeScript.
- **Live authentication and workflow database:** Supabase Auth, PostgreSQL, Row Level Security, database RPCs, and private evidence storage.
- **Evidence integrity:** SHA-256 digests are stored with evidence metadata; raw evidence files are kept off-chain in private storage.
- **Smart contracts:** Solidity sources and local tests are included in the repository. Public testnet deployment is not currently claimed.

## Local development

Requires Node.js 22+ (developed with Node 24).

### Web app

From the repository root:

```bash
cd web
cp .env.local.example .env.local
```

Set the following values in `web/.env.local`:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (Supabase publishable key or legacy anon key)

Then run:

```bash
npm install
npm run dev
```

The app opens at http://localhost:3000.

Never put a Supabase service-role key in a `NEXT_PUBLIC_*` variable or in browser code.

### Tests

From the repository root:

```bash
npm install
npm test
npm run typecheck
```

Web checks:

```bash
npm --prefix web install
npm --prefix web test
npm --prefix web run typecheck
npm --prefix web run build
```

For Supabase schema changes, inspect the migration before applying it to a project. Use the linked project and confirm the dry-run lists only the intended migration.

## Trust, privacy, and limitations

- A hash establishes integrity relative to the hashed file; it does not establish the truth of the file's contents.
- A recorded event establishes that an authorized account submitted an action; it does not independently prove physical custody or processing.
- Keep personal information and raw evidence off public ledgers. The evidence bucket is intended to remain private.
- Environmental impact must remain unavailable until the batch is verified, required evidence is complete, and cited public impact factors are available. Any gross avoided-burden estimate must be presented with its factors and assumptions, not as a carbon credit or guaranteed net impact.
- The prototype uses role-based accounts and a centralized Supabase backend. It is not a fully decentralized production deployment and has not been independently security-audited.

## Hackathon alignment

**Sustainable Supply Chains:** LoopProof focuses on e-waste lifecycle traceability, evidence-backed processing claims, independent review, and transparent limits on environmental-impact reporting. The goal is to make it harder to confuse collection with verified processing and to make unsupported claims visible rather than silently treating them as impact.

## License

See the repository for license information. If no license file is present, all rights are reserved by default; ask the maintainers before reusing the code.
