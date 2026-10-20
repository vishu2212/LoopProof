# LoopProof

AI-assisted, blockchain-backed e-waste traceability — IEEE ClimateChain Global Hackathon 2026 (Sustainable Supply Chains).

> **Collected does not mean recycled. Environmental impact must not be claimed until the required evidence exists.**

**Status:** Milestone 0 — repository foundation only. No lifecycle contract logic yet.

## Layout

```
contracts/   Solidity sources (currently: LoopProofTypes.sol enum scaffold only)
test/        TypeScript tests (currently: toolchain baseline only)
docs/        DECISIONS.md, STATE_MACHINE.md, CONTRACT_TEST_PLAN.md
web/         Next.js UI prototype (synthetic demo data; not connected to any backend or chain)
```

### Web UI prototype (`web/`)

Separate package with its own dependencies, so the Hardhat toolchain is untouched.

```bash
cd web
npm install
npm run dev        # http://localhost:3000
npm run typecheck && npm test && npm run build
```

All data is synthetic (`web/lib/demo-data.ts`). There is no backend, database, or blockchain connection.

## Setup

Requires Node.js 22+ (developed on Node 24).

```bash
npm install
npm run build      # hardhat build
npm test           # hardhat test
npm run typecheck  # tsc --noEmit
```

No secrets are needed for local work. See `.env.example` for testnet placeholders (deployment is out of scope for now).

## Limitations

On-chain records prove that authorized keys recorded actions and that anchored evidence is unaltered — **not** that physical recycling occurred. See `docs/STATE_MACHINE.md` §5.
