# LoopProof

AI-assisted, blockchain-backed e-waste traceability — IEEE ClimateChain Global Hackathon 2026 (Sustainable Supply Chains).

> **Collected does not mean recycled. Environmental impact must not be claimed until the required evidence exists.**

**Status:** Milestone 0 — repository foundation only. No lifecycle contract logic yet.

## Layout

```
contracts/   Solidity sources (currently: LoopProofTypes.sol enum scaffold only)
test/        TypeScript tests (currently: toolchain baseline only)
docs/        DECISIONS.md, STATE_MACHINE.md, CONTRACT_TEST_PLAN.md
```

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
