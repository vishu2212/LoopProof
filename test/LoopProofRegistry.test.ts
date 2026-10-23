// LoopProofRegistry contract tests — CONTRACT_TEST_PLAN.md section B.
import { expect } from "chai";
import { network } from "hardhat";
import { anyValue } from "@nomicfoundation/hardhat-ethers-chai-matchers/withArgs";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/types";
import type { ContractTransactionResponse, FunctionFragment } from "ethers";
import type { LoopProofRegistry } from "../types/ethers-contracts/index.js";
import {
  MAX_UINT128,
  RejectReason,
  ReturnReason,
  State,
  type StateName,
  ZERO_HASH,
  newClaimKey,
  newEvidence,
  out,
  type Output,
} from "./helpers/loopproof.js";

const { ethers, networkHelpers } = await network.create();

const CATEGORY = 7; // opaque, non-zero category code
const INTAKE = 10_000n; // grams
const OUTPUTS: Output[] = [out(1, 6_000n), out(2, 3_000n)]; // 9,000 g <= intake
const OUTPUTS_V2: Output[] = [out(1, 6_500n), out(3, 3_200n)]; // 9,700 g <= intake

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

async function deployFixture() {
  const [admin, registrar, collector, processor, verifier, outsider, processor2, verifier2, collector2, registrar2] =
    await ethers.getSigners();

  const registry = (await ethers.deployContract("LoopProofRegistry", [admin.address])) as unknown as LoopProofRegistry;

  const role = {
    ADMIN: await registry.DEFAULT_ADMIN_ROLE(),
    REGISTRAR: await registry.REGISTRAR_ROLE(),
    COLLECTOR: await registry.COLLECTOR_ROLE(),
    PROCESSOR: await registry.PROCESSOR_ROLE(),
    VERIFIER: await registry.VERIFIER_ROLE(),
  };

  const asAdmin = registry.connect(admin);
  for (const s of [registrar, registrar2]) await asAdmin.grantRole(role.REGISTRAR, s.address);
  for (const s of [collector, collector2]) await asAdmin.grantRole(role.COLLECTOR, s.address);
  for (const s of [processor, processor2]) await asAdmin.grantRole(role.PROCESSOR, s.address);
  for (const s of [verifier, verifier2]) await asAdmin.grantRole(role.VERIFIER, s.address);

  return {
    registry,
    role,
    admin,
    registrar,
    registrar2,
    collector,
    collector2,
    processor,
    processor2,
    verifier,
    verifier2,
    outsider,
  };
}
type Ctx = Awaited<ReturnType<typeof deployFixture>>;

const load = () => networkHelpers.loadFixture(deployFixture);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function register(ctx: Ctx, claimKey = newClaimKey()): Promise<bigint> {
  await (
    await ctx.registry
      .connect(ctx.registrar)
      .registerBatch(claimKey, CATEGORY, ctx.collector.address, ctx.processor.address, ctx.verifier.address)
  ).wait();
  return ctx.registry.batchCount();
}

type Action = "collect" | "receipt" | "submit" | "resubmit" | "verify" | "return" | "reject" | "cancel";
const ACTIONS: Action[] = ["collect", "receipt", "submit", "resubmit", "verify", "return", "reject", "cancel"];

const ACTION_TARGET: Record<Action, bigint> = {
  collect: State.COLLECTED,
  receipt: State.RECEIVED,
  submit: State.PROCESSED_CLAIMED,
  resubmit: State.PROCESSED_CLAIMED,
  verify: State.VERIFIED,
  return: State.RETURNED,
  reject: State.REJECTED,
  cancel: State.CANCELLED,
};

/** Valid (state -> actions) pairs, exactly STATE_MACHINE.md §3. */
const VALID: Partial<Record<StateName, Action[]>> = {
  REGISTERED: ["collect", "cancel"],
  COLLECTED: ["receipt"],
  RECEIVED: ["submit"],
  PROCESSED_CLAIMED: ["verify", "return", "reject"],
  RETURNED: ["resubmit"],
};

function defaultActor(ctx: Ctx, action: Action): HardhatEthersSigner {
  switch (action) {
    case "collect":
      return ctx.collector;
    case "receipt":
    case "submit":
    case "resubmit":
      return ctx.processor;
    case "verify":
    case "return":
    case "reject":
      return ctx.verifier;
    case "cancel":
      return ctx.registrar;
  }
}

/** Performs `action` with fresh, otherwise-valid data. */
function act(
  ctx: Ctx,
  action: Action,
  id: bigint,
  signer: HardhatEthersSigner = defaultActor(ctx, action),
): Promise<ContractTransactionResponse> {
  const r = ctx.registry.connect(signer);
  switch (action) {
    case "collect":
      return r.recordCollection(id, INTAKE, newEvidence("collect"));
    case "receipt":
      return r.recordReceipt(id, newEvidence("receipt"));
    case "submit":
      return r.submitProcessing(id, OUTPUTS, newEvidence("submit"));
    case "resubmit":
      return r.resubmitProcessing(id, OUTPUTS_V2, newEvidence("resubmit"));
    case "verify":
      return r.verifyBatch(id);
    case "return":
      return r.returnBatch(id, ReturnReason.INSUFFICIENT_EVIDENCE);
    case "reject":
      return r.rejectBatch(id, RejectReason.EVIDENCE_INCONSISTENT);
    case "cancel":
      return r.cancelBatch(id);
  }
}

async function run(ctx: Ctx, action: Action, id: bigint) {
  await (await act(ctx, action, id)).wait();
}

/** Registers a batch and drives it to `target` via the canonical path. */
async function advanceTo(ctx: Ctx, target: StateName): Promise<bigint> {
  const id = await register(ctx);
  const paths: Record<StateName, Action[]> = {
    NONE: [],
    REGISTERED: [],
    COLLECTED: ["collect"],
    RECEIVED: ["collect", "receipt"],
    PROCESSED_CLAIMED: ["collect", "receipt", "submit"],
    RETURNED: ["collect", "receipt", "submit", "return"],
    VERIFIED: ["collect", "receipt", "submit", "verify"],
    REJECTED: ["collect", "receipt", "submit", "reject"],
    CANCELLED: ["cancel"],
  };
  for (const a of paths[target]) await run(ctx, a, id);
  expect(await ctx.registry.getState(id)).to.equal(State[target]);
  return id;
}

async function snapshot(ctx: Ctx, id: bigint): Promise<string> {
  const b = await ctx.registry.getBatch(id);
  return Array.from(b).map(String).join("|");
}

async function latestTimestamp(): Promise<bigint> {
  const block = await ethers.provider.getBlock("latest");
  return BigInt(block!.timestamp);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("LoopProofRegistry", function () {
  describe("Deployment", function () {
    it("grants only DEFAULT_ADMIN_ROLE to the admin (no lifecycle roles)", async function () {
      const { registry, role, admin } = await load();
      expect(await registry.hasRole(role.ADMIN, admin.address)).to.equal(true);
      for (const r of [role.REGISTRAR, role.COLLECTOR, role.PROCESSOR, role.VERIFIER]) {
        expect(await registry.hasRole(r, admin.address)).to.equal(false);
      }
      expect(await registry.batchCount()).to.equal(0n);
    });

    it("rejects a zero admin address", async function () {
      const { registry } = await load();
      const factory = await ethers.getContractFactory("LoopProofRegistry");
      await expect(factory.deploy(ethers.ZeroAddress)).to.be.revertedWithCustomError(registry, "ZeroAddress");
    });
  });

  // -------------------------------------------------------------------------
  describe("B1. Authorized and unauthorized actions", function () {
    it("[T-AUTH-01] only REGISTRAR_ROLE can register", async function () {
      const ctx = await load();
      for (const s of [ctx.outsider, ctx.collector, ctx.processor, ctx.verifier, ctx.admin]) {
        await expect(
          ctx.registry
            .connect(s)
            .registerBatch(newClaimKey(), CATEGORY, ctx.collector.address, ctx.processor.address, ctx.verifier.address),
        )
          .to.be.revertedWithCustomError(ctx.registry, "AccessControlUnauthorizedAccount")
          .withArgs(s.address, ctx.role.REGISTRAR);
      }
      expect(await register(ctx)).to.equal(1n);
    });

    const cases: { action: Action; from: StateName; role: "COLLECTOR" | "PROCESSOR" | "VERIFIER"; id: string }[] = [
      { id: "T-AUTH-02", action: "collect", from: "REGISTERED", role: "COLLECTOR" },
      { id: "T-AUTH-03", action: "receipt", from: "COLLECTED", role: "PROCESSOR" },
      { id: "T-AUTH-04", action: "submit", from: "RECEIVED", role: "PROCESSOR" },
      { id: "T-AUTH-05", action: "verify", from: "PROCESSED_CLAIMED", role: "VERIFIER" },
      { id: "T-AUTH-05", action: "return", from: "PROCESSED_CLAIMED", role: "VERIFIER" },
      { id: "T-AUTH-05", action: "reject", from: "PROCESSED_CLAIMED", role: "VERIFIER" },
      { id: "T-AUTH-06", action: "resubmit", from: "RETURNED", role: "PROCESSOR" },
    ];

    for (const c of cases) {
      it(`[${c.id}] ${c.action}: role-less callers revert; only the assigned ${c.role.toLowerCase()} succeeds`, async function () {
        const ctx = await load();
        const id = await advanceTo(ctx, c.from);
        const all = [ctx.outsider, ctx.admin, ctx.registrar, ctx.collector, ctx.processor, ctx.verifier];
        const holder = defaultActor(ctx, c.action);
        for (const s of all.filter((x) => x !== holder)) {
          await expect(act(ctx, c.action, id, s))
            .to.be.revertedWithCustomError(ctx.registry, "AccessControlUnauthorizedAccount")
            .withArgs(s.address, ctx.role[c.role]);
        }
        expect(await ctx.registry.getState(id)).to.equal(State[c.from]);
        await expect(act(ctx, c.action, id)).to.emit(ctx.registry, "BatchStateChanged");
        expect(await ctx.registry.getState(id)).to.equal(ACTION_TARGET[c.action]);
      });
    }

    it("[T-AUTH-07] only the assigned registrar can cancel (admin and other registrars cannot)", async function () {
      const ctx = await load();
      const id = await advanceTo(ctx, "REGISTERED");
      for (const s of [ctx.outsider, ctx.admin, ctx.collector, ctx.processor, ctx.verifier]) {
        await expect(act(ctx, "cancel", id, s))
          .to.be.revertedWithCustomError(ctx.registry, "AccessControlUnauthorizedAccount")
          .withArgs(s.address, ctx.role.REGISTRAR);
      }
      await expect(act(ctx, "cancel", id, ctx.registrar2))
        .to.be.revertedWithCustomError(ctx.registry, "NotAssignedActor")
        .withArgs(id, ctx.registrar2.address);
      await expect(act(ctx, "cancel", id, ctx.registrar))
        .to.emit(ctx.registry, "BatchStateChanged")
        .withArgs(id, State.REGISTERED, State.CANCELLED, ctx.registrar.address, ZERO_HASH);
    });

    it("[T-AUTH-08] only admin can grant/revoke roles; outsider cannot self-grant", async function () {
      const ctx = await load();
      await expect(ctx.registry.connect(ctx.outsider).grantRole(ctx.role.VERIFIER, ctx.outsider.address))
        .to.be.revertedWithCustomError(ctx.registry, "AccessControlUnauthorizedAccount")
        .withArgs(ctx.outsider.address, ctx.role.ADMIN);
      await expect(ctx.registry.connect(ctx.registrar).grantRole(ctx.role.REGISTRAR, ctx.outsider.address))
        .to.be.revertedWithCustomError(ctx.registry, "AccessControlUnauthorizedAccount")
        .withArgs(ctx.registrar.address, ctx.role.ADMIN);
      await ctx.registry.connect(ctx.admin).grantRole(ctx.role.VERIFIER, ctx.outsider.address);
      expect(await ctx.registry.hasRole(ctx.role.VERIFIER, ctx.outsider.address)).to.equal(true);
      await ctx.registry.connect(ctx.admin).revokeRole(ctx.role.VERIFIER, ctx.outsider.address);
      expect(await ctx.registry.hasRole(ctx.role.VERIFIER, ctx.outsider.address)).to.equal(false);
    });

    it("[T-AUTH-09] revoking a role blocks that assignee's pending action", async function () {
      const ctx = await load();
      const id = await advanceTo(ctx, "REGISTERED");
      await ctx.registry.connect(ctx.admin).revokeRole(ctx.role.COLLECTOR, ctx.collector.address);
      await expect(act(ctx, "collect", id))
        .to.be.revertedWithCustomError(ctx.registry, "AccessControlUnauthorizedAccount")
        .withArgs(ctx.collector.address, ctx.role.COLLECTOR);
      expect(await ctx.registry.getState(id)).to.equal(State.REGISTERED);
    });

    it("[T-AUTH-09b] revoking VERIFIER_ROLE blocks verification of an assigned batch", async function () {
      const ctx = await load();
      const id = await advanceTo(ctx, "PROCESSED_CLAIMED");
      await ctx.registry.connect(ctx.admin).revokeRole(ctx.role.VERIFIER, ctx.verifier.address);
      await expect(act(ctx, "verify", id))
        .to.be.revertedWithCustomError(ctx.registry, "AccessControlUnauthorizedAccount")
        .withArgs(ctx.verifier.address, ctx.role.VERIFIER);
    });

    it("[T-AUTH-10] role holders who are not the batch's assignee revert with NotAssignedActor", async function () {
      const ctx = await load();
      let id = await advanceTo(ctx, "REGISTERED");
      await expect(act(ctx, "collect", id, ctx.collector2))
        .to.be.revertedWithCustomError(ctx.registry, "NotAssignedActor")
        .withArgs(id, ctx.collector2.address);

      id = await advanceTo(ctx, "COLLECTED");
      await expect(act(ctx, "receipt", id, ctx.processor2))
        .to.be.revertedWithCustomError(ctx.registry, "NotAssignedActor")
        .withArgs(id, ctx.processor2.address);

      id = await advanceTo(ctx, "RECEIVED");
      await expect(act(ctx, "submit", id, ctx.processor2))
        .to.be.revertedWithCustomError(ctx.registry, "NotAssignedActor")
        .withArgs(id, ctx.processor2.address);

      id = await advanceTo(ctx, "RETURNED");
      await expect(act(ctx, "resubmit", id, ctx.processor2))
        .to.be.revertedWithCustomError(ctx.registry, "NotAssignedActor")
        .withArgs(id, ctx.processor2.address);

      id = await advanceTo(ctx, "PROCESSED_CLAIMED");
      for (const a of ["verify", "return", "reject"] as Action[]) {
        await expect(act(ctx, a, id, ctx.verifier2))
          .to.be.revertedWithCustomError(ctx.registry, "NotAssignedActor")
          .withArgs(id, ctx.verifier2.address);
      }
    });

    it("[T-AUTH-11] admin granting itself a lifecycle role still cannot act on an existing batch (D-16/D-17)", async function () {
      const ctx = await load();
      const idReg = await advanceTo(ctx, "REGISTERED");
      await ctx.registry.connect(ctx.admin).grantRole(ctx.role.REGISTRAR, ctx.admin.address);
      await expect(act(ctx, "cancel", idReg, ctx.admin))
        .to.be.revertedWithCustomError(ctx.registry, "NotAssignedActor")
        .withArgs(idReg, ctx.admin.address);

      const id = await advanceTo(ctx, "PROCESSED_CLAIMED");
      await ctx.registry.connect(ctx.admin).grantRole(ctx.role.VERIFIER, ctx.admin.address);
      await expect(act(ctx, "verify", id, ctx.admin))
        .to.be.revertedWithCustomError(ctx.registry, "NotAssignedActor")
        .withArgs(id, ctx.admin.address);
    });
  });

  // -------------------------------------------------------------------------
  describe("Registration validation", function () {
    it("[T-REG-01] stores assignment, category, claim key and timestamps; emits events", async function () {
      const ctx = await load();
      const key = newClaimKey();
      await expect(
        ctx.registry
          .connect(ctx.registrar)
          .registerBatch(key, CATEGORY, ctx.collector.address, ctx.processor.address, ctx.verifier.address),
      )
        .to.emit(ctx.registry, "BatchRegistered")
        .withArgs(1n, key, CATEGORY, ctx.collector.address, ctx.processor.address, ctx.verifier.address)
        .and.to.emit(ctx.registry, "BatchStateChanged")
        .withArgs(1n, State.NONE, State.REGISTERED, ctx.registrar.address, ZERO_HASH);

      const b = await ctx.registry.getBatch(1n);
      expect(b.claimKey).to.equal(key);
      expect(b.category).to.equal(BigInt(CATEGORY));
      expect(b.registrar).to.equal(ctx.registrar.address);
      expect(b.collector).to.equal(ctx.collector.address);
      expect(b.processor).to.equal(ctx.processor.address);
      expect(b.verifier).to.equal(ctx.verifier.address);
      expect(b.state).to.equal(State.REGISTERED);
      expect(b.registeredAt).to.equal(await latestTimestamp());
      expect(await ctx.registry.batchIdByClaimKey(key)).to.equal(1n);
    });

    it("[T-REG-02] rejects zero category", async function () {
      const ctx = await load();
      await expect(
        ctx.registry
          .connect(ctx.registrar)
          .registerBatch(newClaimKey(), 0, ctx.collector.address, ctx.processor.address, ctx.verifier.address),
      ).to.be.revertedWithCustomError(ctx.registry, "InvalidCategory");
    });

    it("[T-REG-03] rejects zero assignee addresses", async function () {
      const ctx = await load();
      const Z = ethers.ZeroAddress;
      const r = ctx.registry.connect(ctx.registrar);
      const [c, p, v] = [ctx.collector.address, ctx.processor.address, ctx.verifier.address];
      for (const args of [
        [Z, p, v],
        [c, Z, v],
        [c, p, Z],
      ] as const) {
        await expect(r.registerBatch(newClaimKey(), CATEGORY, ...args)).to.be.revertedWithCustomError(
          ctx.registry,
          "ZeroAddress",
        );
      }
    });

    it("[T-REG-04] rejects assignees that lack the required role", async function () {
      const ctx = await load();
      const r = ctx.registry.connect(ctx.registrar);
      const o = ctx.outsider.address;
      await expect(r.registerBatch(newClaimKey(), CATEGORY, o, ctx.processor.address, ctx.verifier.address))
        .to.be.revertedWithCustomError(ctx.registry, "AssigneeMissingRole")
        .withArgs(o, ctx.role.COLLECTOR);
      await expect(r.registerBatch(newClaimKey(), CATEGORY, ctx.collector.address, o, ctx.verifier.address))
        .to.be.revertedWithCustomError(ctx.registry, "AssigneeMissingRole")
        .withArgs(o, ctx.role.PROCESSOR);
      await expect(r.registerBatch(newClaimKey(), CATEGORY, ctx.collector.address, ctx.processor.address, o))
        .to.be.revertedWithCustomError(ctx.registry, "AssigneeMissingRole")
        .withArgs(o, ctx.role.VERIFIER);
    });

    it("[T-REG-05] processor cannot be changed after registration (no mutator exists; D-15)", async function () {
      const ctx = await load();
      const fnNames = ctx.registry.interface.fragments
        .filter((f): f is FunctionFragment => f.type === "function")
        .map((f) => f.name.toLowerCase());
      for (const n of fnNames) {
        expect(n).to.not.match(/^(set|change|update|reassign).*(processor|collector|verifier)/);
      }
      const id = await advanceTo(ctx, "RETURNED");
      expect((await ctx.registry.getBatch(id)).processor).to.equal(ctx.processor.address);
    });
  });

  // -------------------------------------------------------------------------
  describe("B2. Every valid lifecycle transition", function () {
    it("[T-TR-01] NONE -> REGISTERED", async function () {
      const ctx = await load();
      const id = await register(ctx);
      expect(await ctx.registry.getState(id)).to.equal(State.REGISTERED);
    });

    it("[T-TR-02] REGISTERED -> COLLECTED stores intake mass and evidence", async function () {
      const ctx = await load();
      const id = await register(ctx);
      const h = newEvidence();
      await expect(ctx.registry.connect(ctx.collector).recordCollection(id, INTAKE, h))
        .to.emit(ctx.registry, "BatchCollected")
        .withArgs(id, INTAKE, h)
        .and.to.emit(ctx.registry, "BatchStateChanged")
        .withArgs(id, State.REGISTERED, State.COLLECTED, ctx.collector.address, h);
      const b = await ctx.registry.getBatch(id);
      expect(b.intakeMassGrams).to.equal(INTAKE);
      expect(b.collectionEvidenceHash).to.equal(h);
      expect(b.collectedAt).to.equal(await latestTimestamp());
      expect(await ctx.registry.evidenceUsed(h)).to.equal(true);
    });

    it("[T-TR-03] REGISTERED -> CANCELLED", async function () {
      const ctx = await load();
      const id = await register(ctx);
      await expect(ctx.registry.connect(ctx.registrar).cancelBatch(id))
        .to.emit(ctx.registry, "BatchCancelled")
        .withArgs(id)
        .and.to.emit(ctx.registry, "BatchStateChanged")
        .withArgs(id, State.REGISTERED, State.CANCELLED, ctx.registrar.address, ZERO_HASH);
      const b = await ctx.registry.getBatch(id);
      expect(b.state).to.equal(State.CANCELLED);
      expect(b.finalizedAt).to.equal(await latestTimestamp());
    });

    it("[T-TR-04] COLLECTED -> RECEIVED by the locked processor", async function () {
      const ctx = await load();
      const id = await advanceTo(ctx, "COLLECTED");
      const h = newEvidence();
      await expect(ctx.registry.connect(ctx.processor).recordReceipt(id, h))
        .to.emit(ctx.registry, "BatchReceived")
        .withArgs(id, h)
        .and.to.emit(ctx.registry, "BatchStateChanged")
        .withArgs(id, State.COLLECTED, State.RECEIVED, ctx.processor.address, h);
      const b = await ctx.registry.getBatch(id);
      expect(b.receiptEvidenceHash).to.equal(h);
      expect(b.receivedAt).to.equal(await latestTimestamp());
    });

    it("[T-TR-05] RECEIVED -> PROCESSED_CLAIMED stores outputs as revision 0", async function () {
      const ctx = await load();
      const id = await advanceTo(ctx, "RECEIVED");
      const h = newEvidence();
      await expect(ctx.registry.connect(ctx.processor).submitProcessing(id, OUTPUTS, h))
        .to.emit(ctx.registry, "ProcessingSubmitted")
        .withArgs(id, 0n, 9_000n, h, anyValue)
        .and.to.emit(ctx.registry, "BatchStateChanged")
        .withArgs(id, State.RECEIVED, State.PROCESSED_CLAIMED, ctx.processor.address, h);
      const b = await ctx.registry.getBatch(id);
      expect(b.revisionCount).to.equal(1n);
      expect(b.currentOutputMassGrams).to.equal(9_000n);
      const [rev, outs] = await ctx.registry.getRevision(id, 0n);
      expect(rev.evidenceHash).to.equal(h);
      expect(rev.totalOutputMassGrams).to.equal(9_000n);
      expect(rev.returnReason).to.equal(ReturnReason.NONE);
      expect(outs.map((o) => [o.materialCode, o.massGrams])).to.deep.equal([
        [1n, 6_000n],
        [2n, 3_000n],
      ]);
    });

    it("[T-TR-06] PROCESSED_CLAIMED -> VERIFIED", async function () {
      const ctx = await load();
      const id = await advanceTo(ctx, "PROCESSED_CLAIMED");
      await run(ctx, "verify", id);
      const b = await ctx.registry.getBatch(id);
      expect(b.state).to.equal(State.VERIFIED);
      expect(b.finalizedAt).to.equal(await latestTimestamp());
    });

    it("[T-TR-07] PROCESSED_CLAIMED -> RETURNED", async function () {
      const ctx = await load();
      const id = await advanceTo(ctx, "PROCESSED_CLAIMED");
      await run(ctx, "return", id);
      expect(await ctx.registry.getState(id)).to.equal(State.RETURNED);
    });

    it("[T-TR-08] PROCESSED_CLAIMED -> REJECTED", async function () {
      const ctx = await load();
      const id = await advanceTo(ctx, "PROCESSED_CLAIMED");
      await run(ctx, "reject", id);
      const b = await ctx.registry.getBatch(id);
      expect(b.state).to.equal(State.REJECTED);
      expect(b.rejectReason).to.equal(RejectReason.EVIDENCE_INCONSISTENT);
      expect(b.finalizedAt).to.equal(await latestTimestamp());
    });

    it("[T-TR-09] RETURNED -> PROCESSED_CLAIMED via resubmit", async function () {
      const ctx = await load();
      const id = await advanceTo(ctx, "RETURNED");
      await run(ctx, "resubmit", id);
      expect(await ctx.registry.getState(id)).to.equal(State.PROCESSED_CLAIMED);
    });

    it("[T-TR-10] full happy path REGISTERED -> ... -> VERIFIED", async function () {
      const ctx = await load();
      const id = await register(ctx);
      for (const a of ["collect", "receipt", "submit", "verify"] as Action[]) {
        await run(ctx, a, id);
        expect(await ctx.registry.getState(id)).to.equal(ACTION_TARGET[a]);
      }
    });

    it("[T-TR-11] batches are independent of each other", async function () {
      const ctx = await load();
      const a = await advanceTo(ctx, "VERIFIED");
      const b = await advanceTo(ctx, "REGISTERED");
      expect(await ctx.registry.getState(a)).to.equal(State.VERIFIED);
      expect(await ctx.registry.getState(b)).to.equal(State.REGISTERED);
      expect(b).to.equal(a + 1n);
    });
  });

  // -------------------------------------------------------------------------
  describe("B3. Skipped and invalid transitions", function () {
    it("[T-INV-01] REGISTERED: receipt (skip collect) reverts", async function () {
      const ctx = await load();
      const id = await advanceTo(ctx, "REGISTERED");
      await expect(act(ctx, "receipt", id))
        .to.be.revertedWithCustomError(ctx.registry, "InvalidTransition")
        .withArgs(id, State.REGISTERED, State.RECEIVED);
    });

    it("[T-INV-02] REGISTERED: submit reverts", async function () {
      const ctx = await load();
      const id = await advanceTo(ctx, "REGISTERED");
      await expect(act(ctx, "submit", id))
        .to.be.revertedWithCustomError(ctx.registry, "InvalidTransition")
        .withArgs(id, State.REGISTERED, State.PROCESSED_CLAIMED);
    });

    it("[T-INV-03] COLLECTED: submit (skip receipt) reverts", async function () {
      const ctx = await load();
      const id = await advanceTo(ctx, "COLLECTED");
      await expect(act(ctx, "submit", id))
        .to.be.revertedWithCustomError(ctx.registry, "InvalidTransition")
        .withArgs(id, State.COLLECTED, State.PROCESSED_CLAIMED);
    });

    it("[T-INV-04] RECEIVED: verify (skip claim) reverts", async function () {
      const ctx = await load();
      const id = await advanceTo(ctx, "RECEIVED");
      await expect(act(ctx, "verify", id))
        .to.be.revertedWithCustomError(ctx.registry, "InvalidTransition")
        .withArgs(id, State.RECEIVED, State.VERIFIED);
    });

    it("[T-INV-05] REGISTERED/COLLECTED: verify reverts", async function () {
      const ctx = await load();
      for (const s of ["REGISTERED", "COLLECTED"] as StateName[]) {
        const id = await advanceTo(ctx, s);
        await expect(act(ctx, "verify", id))
          .to.be.revertedWithCustomError(ctx.registry, "InvalidTransition")
          .withArgs(id, State[s], State.VERIFIED);
      }
    });

    it("[T-INV-06] cancel after collection reverts in every non-REGISTERED live state", async function () {
      const ctx = await load();
      for (const s of ["COLLECTED", "RECEIVED", "PROCESSED_CLAIMED", "RETURNED"] as StateName[]) {
        const id = await advanceTo(ctx, s);
        await expect(act(ctx, "cancel", id))
          .to.be.revertedWithCustomError(ctx.registry, "InvalidTransition")
          .withArgs(id, State[s], State.CANCELLED);
      }
    });

    it("[T-INV-07] regression attempts revert (collect again from RECEIVED, receipt again from PROCESSED_CLAIMED)", async function () {
      const ctx = await load();
      let id = await advanceTo(ctx, "RECEIVED");
      await expect(act(ctx, "collect", id))
        .to.be.revertedWithCustomError(ctx.registry, "InvalidTransition")
        .withArgs(id, State.RECEIVED, State.COLLECTED);
      id = await advanceTo(ctx, "PROCESSED_CLAIMED");
      await expect(act(ctx, "receipt", id))
        .to.be.revertedWithCustomError(ctx.registry, "InvalidTransition")
        .withArgs(id, State.PROCESSED_CLAIMED, State.RECEIVED);
    });

    it("[T-INV-08] RETURNED: verify without resubmission reverts", async function () {
      const ctx = await load();
      const id = await advanceTo(ctx, "RETURNED");
      await expect(act(ctx, "verify", id))
        .to.be.revertedWithCustomError(ctx.registry, "InvalidTransition")
        .withArgs(id, State.RETURNED, State.VERIFIED);
    });

    it("[T-INV-09] every action on a non-existent batch reverts with UnknownBatch", async function () {
      const ctx = await load();
      await register(ctx);
      for (const bad of [0n, 2n, 999n]) {
        for (const a of ACTIONS) {
          await expect(act(ctx, a, bad)).to.be.revertedWithCustomError(ctx.registry, "UnknownBatch").withArgs(bad);
        }
        await expect(ctx.registry.getBatch(bad)).to.be.revertedWithCustomError(ctx.registry, "UnknownBatch");
      }
    });

    it("[T-INV-11] resubmit is not allowed from PROCESSED_CLAIMED (must be returned first)", async function () {
      const ctx = await load();
      const id = await advanceTo(ctx, "PROCESSED_CLAIMED");
      await expect(act(ctx, "resubmit", id))
        .to.be.revertedWithCustomError(ctx.registry, "InvalidTransition")
        .withArgs(id, State.PROCESSED_CLAIMED, State.PROCESSED_CLAIMED);
    });

    describe("[T-INV-10] exhaustive (state x action) matrix", function () {
      const states: StateName[] = [
        "REGISTERED",
        "COLLECTED",
        "RECEIVED",
        "PROCESSED_CLAIMED",
        "RETURNED",
        "VERIFIED",
        "REJECTED",
        "CANCELLED",
      ];
      for (const s of states) {
        for (const a of ACTIONS) {
          const valid = VALID[s]?.includes(a) ?? false;
          it(`${s} + ${a} -> ${valid ? "succeeds" : "reverts InvalidTransition, state unchanged"}`, async function () {
            const ctx = await load();
            const id = await advanceTo(ctx, s);
            if (valid) {
              await run(ctx, a, id);
              expect(await ctx.registry.getState(id)).to.equal(ACTION_TARGET[a]);
            } else {
              const before = await snapshot(ctx, id);
              await expect(act(ctx, a, id))
                .to.be.revertedWithCustomError(ctx.registry, "InvalidTransition")
                .withArgs(id, State[s], ACTION_TARGET[a]);
              expect(await snapshot(ctx, id)).to.equal(before);
            }
          });
        }
      }
    });
  });

  // -------------------------------------------------------------------------
  describe("B4. Terminal-state immutability", function () {
    const terminal: [string, StateName][] = [
      ["T-TERM-01", "VERIFIED"],
      ["T-TERM-02", "REJECTED"],
      ["T-TERM-03", "CANCELLED"],
    ];
    for (const [tid, s] of terminal) {
      it(`[${tid}] ${s}: every action reverts and stored data is unchanged`, async function () {
        const ctx = await load();
        const id = await advanceTo(ctx, s);
        const before = await snapshot(ctx, id);
        const revsBefore = (await ctx.registry.getBatch(id)).revisionCount;
        for (const a of ACTIONS) {
          await expect(act(ctx, a, id)).to.be.revertedWithCustomError(ctx.registry, "InvalidTransition");
        }
        expect(await snapshot(ctx, id)).to.equal(before);
        expect((await ctx.registry.getBatch(id)).revisionCount).to.equal(revsBefore);
      });
    }
  });

  // -------------------------------------------------------------------------
  describe("B5. Duplicate claim rejection", function () {
    it("[T-DUP-01] registering the same claim key twice reverts", async function () {
      const ctx = await load();
      const key = newClaimKey();
      await register(ctx, key);
      await expect(register(ctx, key)).to.be.revertedWithCustomError(ctx.registry, "DuplicateClaimKey").withArgs(key);
    });

    it("[T-DUP-02] claim key of a CANCELLED batch cannot be reused", async function () {
      const ctx = await load();
      const key = newClaimKey();
      const id = await register(ctx, key);
      await run(ctx, "cancel", id);
      await expect(register(ctx, key)).to.be.revertedWithCustomError(ctx.registry, "DuplicateClaimKey").withArgs(key);
    });

    it("[T-DUP-03] claim keys of VERIFIED and REJECTED batches cannot be reused", async function () {
      const ctx = await load();
      for (const s of ["VERIFIED", "REJECTED"] as StateName[]) {
        const id = await advanceTo(ctx, s);
        const key = (await ctx.registry.getBatch(id)).claimKey;
        await expect(register(ctx, key)).to.be.revertedWithCustomError(ctx.registry, "DuplicateClaimKey").withArgs(key);
      }
    });

    it("[T-DUP-04] zero claim key reverts", async function () {
      const ctx = await load();
      await expect(register(ctx, ZERO_HASH)).to.be.revertedWithCustomError(ctx.registry, "ZeroClaimKey");
    });

    it("[T-DUP-05] a different registrar also cannot reuse a claim key", async function () {
      const ctx = await load();
      const key = newClaimKey();
      await register(ctx, key);
      await expect(
        ctx.registry
          .connect(ctx.registrar2)
          .registerBatch(key, CATEGORY, ctx.collector.address, ctx.processor.address, ctx.verifier.address),
      )
        .to.be.revertedWithCustomError(ctx.registry, "DuplicateClaimKey")
        .withArgs(key);
    });
  });

  // -------------------------------------------------------------------------
  describe("B6. Evidence-hash reuse rejection", function () {
    it("[T-EVD-01] same hash for collect then receipt on the same batch reverts", async function () {
      const ctx = await load();
      const id = await register(ctx);
      const h = newEvidence();
      await ctx.registry.connect(ctx.collector).recordCollection(id, INTAKE, h);
      await expect(ctx.registry.connect(ctx.processor).recordReceipt(id, h))
        .to.be.revertedWithCustomError(ctx.registry, "EvidenceAlreadyUsed")
        .withArgs(h);
    });

    it("[T-EVD-02] hash used on batch A is rejected on batch B", async function () {
      const ctx = await load();
      const a = await register(ctx);
      const b = await register(ctx);
      const h = newEvidence();
      await ctx.registry.connect(ctx.collector).recordCollection(a, INTAKE, h);
      await expect(ctx.registry.connect(ctx.collector).recordCollection(b, INTAKE, h))
        .to.be.revertedWithCustomError(ctx.registry, "EvidenceAlreadyUsed")
        .withArgs(h);
    });

    it("[T-EVD-03] resubmit with the original processing evidence hash reverts", async function () {
      const ctx = await load();
      const id = await advanceTo(ctx, "RECEIVED");
      const h = newEvidence();
      await ctx.registry.connect(ctx.processor).submitProcessing(id, OUTPUTS, h);
      await run(ctx, "return", id);
      await expect(ctx.registry.connect(ctx.processor).resubmitProcessing(id, OUTPUTS_V2, h))
        .to.be.revertedWithCustomError(ctx.registry, "EvidenceAlreadyUsed")
        .withArgs(h);
    });

    it("[T-EVD-04] zero evidence hash reverts at every evidence-bearing stage", async function () {
      const ctx = await load();
      let id = await register(ctx);
      await expect(
        ctx.registry.connect(ctx.collector).recordCollection(id, INTAKE, ZERO_HASH),
      ).to.be.revertedWithCustomError(ctx.registry, "MissingEvidence");

      id = await advanceTo(ctx, "COLLECTED");
      await expect(ctx.registry.connect(ctx.processor).recordReceipt(id, ZERO_HASH)).to.be.revertedWithCustomError(
        ctx.registry,
        "MissingEvidence",
      );

      id = await advanceTo(ctx, "RECEIVED");
      await expect(
        ctx.registry.connect(ctx.processor).submitProcessing(id, OUTPUTS, ZERO_HASH),
      ).to.be.revertedWithCustomError(ctx.registry, "MissingEvidence");

      id = await advanceTo(ctx, "RETURNED");
      await expect(
        ctx.registry.connect(ctx.processor).resubmitProcessing(id, OUTPUTS_V2, ZERO_HASH),
      ).to.be.revertedWithCustomError(ctx.registry, "MissingEvidence");
    });

    it("[T-EVD-05] a failed (reverted) action does not consume its evidence hash", async function () {
      const ctx = await load();
      const id = await advanceTo(ctx, "RECEIVED");
      const h = newEvidence();
      await expect(
        ctx.registry.connect(ctx.processor).submitProcessing(id, [out(1, INTAKE + 1n)], h),
      ).to.be.revertedWithCustomError(ctx.registry, "MassBalanceExceeded");
      expect(await ctx.registry.evidenceUsed(h)).to.equal(false);
      await ctx.registry.connect(ctx.processor).submitProcessing(id, OUTPUTS, h);
      expect(await ctx.registry.evidenceUsed(h)).to.equal(true);
    });
  });

  // -------------------------------------------------------------------------
  describe("B7. Verifier independence (self-verification rejection)", function () {
    it("[T-IND-01] processor holding VERIFIER_ROLE cannot verify a batch it processed", async function () {
      const ctx = await load();
      await ctx.registry.connect(ctx.admin).grantRole(ctx.role.VERIFIER, ctx.processor.address);
      // Cannot be assigned as the verifier of its own batch...
      await expect(
        ctx.registry
          .connect(ctx.registrar)
          .registerBatch(newClaimKey(), CATEGORY, ctx.collector.address, ctx.processor.address, ctx.processor.address),
      )
        .to.be.revertedWithCustomError(ctx.registry, "VerifierNotIndependent")
        .withArgs(ctx.processor.address);
      // ...and cannot verify a batch it processed where someone else is verifier (reverts with VerifierNotIndependent).
      const id = await advanceTo(ctx, "PROCESSED_CLAIMED");
      await expect(act(ctx, "verify", id, ctx.processor))
        .to.be.revertedWithCustomError(ctx.registry, "VerifierNotIndependent")
        .withArgs(ctx.processor.address);
    });

    it("[T-IND-02] collector holding VERIFIER_ROLE cannot verify a batch it collected", async function () {
      const ctx = await load();
      await ctx.registry.connect(ctx.admin).grantRole(ctx.role.VERIFIER, ctx.collector.address);
      await expect(
        ctx.registry
          .connect(ctx.registrar)
          .registerBatch(newClaimKey(), CATEGORY, ctx.collector.address, ctx.processor.address, ctx.collector.address),
      )
        .to.be.revertedWithCustomError(ctx.registry, "VerifierNotIndependent")
        .withArgs(ctx.collector.address);
      const id = await advanceTo(ctx, "PROCESSED_CLAIMED");
      await expect(act(ctx, "verify", id, ctx.collector))
        .to.be.revertedWithCustomError(ctx.registry, "VerifierNotIndependent")
        .withArgs(ctx.collector.address);
    });

    it("[T-IND-03] the same independence rules apply to return and reject", async function () {
      const ctx = await load();
      await ctx.registry.connect(ctx.admin).grantRole(ctx.role.VERIFIER, ctx.processor.address);
      await ctx.registry.connect(ctx.admin).grantRole(ctx.role.VERIFIER, ctx.collector.address);
      const id = await advanceTo(ctx, "PROCESSED_CLAIMED");
      for (const s of [ctx.processor, ctx.collector]) {
        for (const a of ["return", "reject"] as Action[]) {
          await expect(act(ctx, a, id, s))
            .to.be.revertedWithCustomError(ctx.registry, "VerifierNotIndependent")
            .withArgs(s.address);
        }
      }
      expect(await ctx.registry.getState(id)).to.equal(State.PROCESSED_CLAIMED);
    });

    it("[T-IND-04] the distinct assigned verifier can verify (positive control)", async function () {
      const ctx = await load();
      const id = await advanceTo(ctx, "PROCESSED_CLAIMED");
      await expect(act(ctx, "verify", id)).to.emit(ctx.registry, "BatchVerified").withArgs(id, 0n, ctx.verifier.address);
    });

    it("[T-IND-05] collector and processor may be the same address, but verifier must still differ", async function () {
      const ctx = await load();
      await ctx.registry.connect(ctx.admin).grantRole(ctx.role.PROCESSOR, ctx.collector.address);
      await expect(
        ctx.registry
          .connect(ctx.registrar)
          .registerBatch(newClaimKey(), CATEGORY, ctx.collector.address, ctx.collector.address, ctx.verifier.address),
      ).to.emit(ctx.registry, "BatchRegistered");
    });
  });

  // -------------------------------------------------------------------------
  describe("B8. Mass-balance validation", function () {
    it("[T-MASS-01] collect with intake mass 0 reverts", async function () {
      const ctx = await load();
      const id = await register(ctx);
      await expect(
        ctx.registry.connect(ctx.collector).recordCollection(id, 0n, newEvidence()),
      ).to.be.revertedWithCustomError(ctx.registry, "ZeroIntakeMass");
    });

    it("[T-MASS-02] outputs summing exactly to intake succeed", async function () {
      const ctx = await load();
      const id = await advanceTo(ctx, "RECEIVED");
      await ctx.registry.connect(ctx.processor).submitProcessing(id, [out(1, 4_000n), out(2, 6_000n)], newEvidence());
      expect((await ctx.registry.getBatch(id)).currentOutputMassGrams).to.equal(INTAKE);
    });

    it("[T-MASS-03] outputs below intake succeed (losses allowed)", async function () {
      const ctx = await load();
      const id = await advanceTo(ctx, "RECEIVED");
      await ctx.registry.connect(ctx.processor).submitProcessing(id, [out(1, 1n)], newEvidence());
      expect((await ctx.registry.getBatch(id)).currentOutputMassGrams).to.equal(1n);
    });

    it("[T-MASS-04] outputs summing to intake + 1 gram revert", async function () {
      const ctx = await load();
      const id = await advanceTo(ctx, "RECEIVED");
      await expect(
        ctx.registry.connect(ctx.processor).submitProcessing(id, [out(1, 5_000n), out(2, 5_001n)], newEvidence()),
      )
        .to.be.revertedWithCustomError(ctx.registry, "MassBalanceExceeded")
        .withArgs(INTAKE + 1n, INTAKE);
    });

    it("[T-MASS-05] mass balance is enforced again on resubmit", async function () {
      const ctx = await load();
      const id = await advanceTo(ctx, "RETURNED");
      await expect(
        ctx.registry.connect(ctx.processor).resubmitProcessing(id, [out(1, INTAKE), out(2, 1n)], newEvidence()),
      )
        .to.be.revertedWithCustomError(ctx.registry, "MassBalanceExceeded")
        .withArgs(INTAKE + 1n, INTAKE);
      expect(await ctx.registry.getState(id)).to.equal(State.RETURNED);
    });

    it("[T-MASS-06] max-scale values revert cleanly with MassBalanceExceeded (no overflow/panic)", async function () {
      const ctx = await load();
      const id = await register(ctx);
      await ctx.registry.connect(ctx.collector).recordCollection(id, MAX_UINT128, newEvidence());
      await run(ctx, "receipt", id);
      const huge = Array.from({ length: 16 }, (_, i) => out(i + 1, MAX_UINT128));
      await expect(ctx.registry.connect(ctx.processor).submitProcessing(id, huge, newEvidence()))
        .to.be.revertedWithCustomError(ctx.registry, "MassBalanceExceeded")
        .withArgs(MAX_UINT128 * 16n, MAX_UINT128);
      await ctx.registry.connect(ctx.processor).submitProcessing(id, [out(1, MAX_UINT128)], newEvidence());
      expect((await ctx.registry.getBatch(id)).currentOutputMassGrams).to.equal(MAX_UINT128);
    });

    it("[T-MASS-07] empty output set reverts with NoOutputs", async function () {
      const ctx = await load();
      const id = await advanceTo(ctx, "RECEIVED");
      await expect(
        ctx.registry.connect(ctx.processor).submitProcessing(id, [], newEvidence()),
      ).to.be.revertedWithCustomError(ctx.registry, "NoOutputs");
    });

    it("[T-MASS-08] more than MAX_OUTPUTS (16) outputs revert", async function () {
      const ctx = await load();
      const id = await advanceTo(ctx, "RECEIVED");
      const many = Array.from({ length: 17 }, (_, i) => out(i + 1, 1n));
      await expect(ctx.registry.connect(ctx.processor).submitProcessing(id, many, newEvidence()))
        .to.be.revertedWithCustomError(ctx.registry, "TooManyOutputs")
        .withArgs(17n, 16n);
      await ctx.registry.connect(ctx.processor).submitProcessing(id, many.slice(0, 16), newEvidence());
    });

    it("[T-MASS-09] zero material code or zero output mass reverts with InvalidOutput(index)", async function () {
      const ctx = await load();
      const id = await advanceTo(ctx, "RECEIVED");
      await expect(
        ctx.registry.connect(ctx.processor).submitProcessing(id, [out(1, 10n), out(0, 10n)], newEvidence()),
      )
        .to.be.revertedWithCustomError(ctx.registry, "InvalidOutput")
        .withArgs(1n);
      await expect(ctx.registry.connect(ctx.processor).submitProcessing(id, [out(1, 0n)], newEvidence()))
        .to.be.revertedWithCustomError(ctx.registry, "InvalidOutput")
        .withArgs(0n);
    });
  });

  // -------------------------------------------------------------------------
  describe("B9. RETURNED resubmission path and revision history", function () {
    it("[T-RET-01] verifier return sets RETURNED and records the reason", async function () {
      const ctx = await load();
      const id = await advanceTo(ctx, "PROCESSED_CLAIMED");
      const [rev0] = await ctx.registry.getRevision(id, 0n);
      await expect(ctx.registry.connect(ctx.verifier).returnBatch(id, ReturnReason.MASS_DISCREPANCY))
        .to.emit(ctx.registry, "BatchReturned")
        .withArgs(id, 0n, ReturnReason.MASS_DISCREPANCY)
        .and.to.emit(ctx.registry, "BatchStateChanged")
        .withArgs(id, State.PROCESSED_CLAIMED, State.RETURNED, ctx.verifier.address, rev0.evidenceHash);
      expect((await ctx.registry.getBatch(id)).lastReturnReason).to.equal(ReturnReason.MASS_DISCREPANCY);
      expect((await ctx.registry.getRevision(id, 0n))[0].returnReason).to.equal(ReturnReason.MASS_DISCREPANCY);
    });

    it("[T-RET-02] resubmit replaces current outputs and preserves the previous revision (D-13)", async function () {
      const ctx = await load();
      const id = await advanceTo(ctx, "RECEIVED");
      const h0 = newEvidence();
      await ctx.registry.connect(ctx.processor).submitProcessing(id, OUTPUTS, h0);
      await run(ctx, "return", id);
      const h1 = newEvidence();
      await expect(ctx.registry.connect(ctx.processor).resubmitProcessing(id, OUTPUTS_V2, h1))
        .to.emit(ctx.registry, "ProcessingSubmitted")
        .withArgs(id, 1n, 9_700n, h1, anyValue)
        .and.to.emit(ctx.registry, "BatchStateChanged")
        .withArgs(id, State.RETURNED, State.PROCESSED_CLAIMED, ctx.processor.address, h1);

      const b = await ctx.registry.getBatch(id);
      expect(b.revisionCount).to.equal(2n);
      expect(b.currentOutputMassGrams).to.equal(9_700n);
      const current = await ctx.registry.getCurrentOutputs(id);
      expect(current.map((o) => [o.materialCode, o.massGrams])).to.deep.equal([
        [1n, 6_500n],
        [3n, 3_200n],
      ]);

      const [rev0, outs0] = await ctx.registry.getRevision(id, 0n);
      expect(rev0.evidenceHash).to.equal(h0);
      expect(rev0.totalOutputMassGrams).to.equal(9_000n);
      expect(rev0.returnReason).to.equal(ReturnReason.INSUFFICIENT_EVIDENCE);
      expect(outs0.map((o) => [o.materialCode, o.massGrams])).to.deep.equal([
        [1n, 6_000n],
        [2n, 3_000n],
      ]);
      const [rev1] = await ctx.registry.getRevision(id, 1n);
      expect(rev1.evidenceHash).to.equal(h1);
      expect(rev1.returnReason).to.equal(ReturnReason.NONE);
      expect(await ctx.registry.evidenceUsed(h0)).to.equal(true);
    });

    it("[T-RET-03] resubmit reusing old evidence reverts (cross-ref T-EVD-03) — also any earlier batch evidence", async function () {
      const ctx = await load();
      const id = await advanceTo(ctx, "RETURNED");
      const collectHash = (await ctx.registry.getBatch(id)).collectionEvidenceHash;
      await expect(ctx.registry.connect(ctx.processor).resubmitProcessing(id, OUTPUTS_V2, collectHash))
        .to.be.revertedWithCustomError(ctx.registry, "EvidenceAlreadyUsed")
        .withArgs(collectHash);
    });

    it("[T-RET-04] multiple return/resubmit cycles are allowed, each with fresh evidence", async function () {
      const ctx = await load();
      const id = await advanceTo(ctx, "PROCESSED_CLAIMED");
      const reasons = [ReturnReason.INSUFFICIENT_EVIDENCE, ReturnReason.EVIDENCE_UNREADABLE, ReturnReason.OUTPUT_DATA_INCOMPLETE];
      for (const r of reasons) {
        await ctx.registry.connect(ctx.verifier).returnBatch(id, r);
        await run(ctx, "resubmit", id);
      }
      const b = await ctx.registry.getBatch(id);
      expect(b.revisionCount).to.equal(4n);
      expect(b.state).to.equal(State.PROCESSED_CLAIMED);
      for (let i = 0; i < reasons.length; i++) {
        expect((await ctx.registry.getRevision(id, BigInt(i)))[0].returnReason).to.equal(reasons[i]);
      }
      expect((await ctx.registry.getRevision(id, 3n))[0].returnReason).to.equal(ReturnReason.NONE);
    });

    it("[T-RET-05] after resubmit, verifier can verify; verification references the latest revision", async function () {
      const ctx = await load();
      const id = await advanceTo(ctx, "RETURNED");
      const h1 = newEvidence();
      await ctx.registry.connect(ctx.processor).resubmitProcessing(id, OUTPUTS_V2, h1);
      await expect(ctx.registry.connect(ctx.verifier).verifyBatch(id))
        .to.emit(ctx.registry, "BatchVerified")
        .withArgs(id, 1n, ctx.verifier.address)
        .and.to.emit(ctx.registry, "BatchStateChanged")
        .withArgs(id, State.PROCESSED_CLAIMED, State.VERIFIED, ctx.verifier.address, h1);
    });

    it("[T-RET-06] getRevision out of range reverts with UnknownRevision; getCurrentOutputs is empty before any submission", async function () {
      const ctx = await load();
      const id = await advanceTo(ctx, "RECEIVED");
      expect(await ctx.registry.getCurrentOutputs(id)).to.deep.equal([]);
      await expect(ctx.registry.getRevision(id, 0n))
        .to.be.revertedWithCustomError(ctx.registry, "UnknownRevision")
        .withArgs(id, 0n);
      await run(ctx, "submit", id);
      await expect(ctx.registry.getRevision(id, 1n))
        .to.be.revertedWithCustomError(ctx.registry, "UnknownRevision")
        .withArgs(id, 1n);
    });
  });

  // -------------------------------------------------------------------------
  describe("Reason codes (D-14)", function () {
    it("[T-RSN-01] return with NONE (0) reverts with InvalidReasonCode", async function () {
      const ctx = await load();
      const id = await advanceTo(ctx, "PROCESSED_CLAIMED");
      await expect(
        ctx.registry.connect(ctx.verifier).returnBatch(id, ReturnReason.NONE),
      ).to.be.revertedWithCustomError(ctx.registry, "InvalidReasonCode");
    });

    it("[T-RSN-02] reject with NONE (0) reverts with InvalidReasonCode", async function () {
      const ctx = await load();
      const id = await advanceTo(ctx, "PROCESSED_CLAIMED");
      await expect(
        ctx.registry.connect(ctx.verifier).rejectBatch(id, RejectReason.NONE),
      ).to.be.revertedWithCustomError(ctx.registry, "InvalidReasonCode");
    });

    it("[T-RSN-03] out-of-range reason codes revert", async function () {
      const ctx = await load();
      const id = await advanceTo(ctx, "PROCESSED_CLAIMED");
      await expect(ctx.registry.connect(ctx.verifier).returnBatch(id, 5n)).to.be.revert(ethers);
      await expect(ctx.registry.connect(ctx.verifier).rejectBatch(id, 99n)).to.be.revert(ethers);
      expect(await ctx.registry.getState(id)).to.equal(State.PROCESSED_CLAIMED);
    });

    for (const [name, code] of Object.entries(ReturnReason).filter(([, c]) => c !== 0n)) {
      it(`[T-RSN-04] return reason ${name} (${code}) is accepted, stored and emitted`, async function () {
        const ctx = await load();
        const id = await advanceTo(ctx, "PROCESSED_CLAIMED");
        await expect(ctx.registry.connect(ctx.verifier).returnBatch(id, code))
          .to.emit(ctx.registry, "BatchReturned")
          .withArgs(id, 0n, code);
        expect((await ctx.registry.getBatch(id)).lastReturnReason).to.equal(code);
      });
    }

    for (const [name, code] of Object.entries(RejectReason).filter(([, c]) => c !== 0n)) {
      it(`[T-RSN-05] reject reason ${name} (${code}) is accepted, stored and emitted`, async function () {
        const ctx = await load();
        const id = await advanceTo(ctx, "PROCESSED_CLAIMED");
        await expect(ctx.registry.connect(ctx.verifier).rejectBatch(id, code))
          .to.emit(ctx.registry, "BatchRejected")
          .withArgs(id, 0n, code);
        expect((await ctx.registry.getBatch(id)).rejectReason).to.equal(code);
      });
    }
  });

  // -------------------------------------------------------------------------
  describe("B10. Verification and event emission", function () {
    it("[T-EVT-01] every transition emits BatchStateChanged with batchId, from, to, actor, evidenceHash", async function () {
      const ctx = await load();
      const r = ctx.registry;
      const key = newClaimKey();
      await expect(
        r
          .connect(ctx.registrar)
          .registerBatch(key, CATEGORY, ctx.collector.address, ctx.processor.address, ctx.verifier.address),
      )
        .to.emit(r, "BatchStateChanged")
        .withArgs(1n, State.NONE, State.REGISTERED, ctx.registrar.address, ZERO_HASH);
      const id = 1n;
      const h = [newEvidence(), newEvidence(), newEvidence(), newEvidence()];
      await expect(r.connect(ctx.collector).recordCollection(id, INTAKE, h[0]))
        .to.emit(r, "BatchStateChanged")
        .withArgs(id, State.REGISTERED, State.COLLECTED, ctx.collector.address, h[0]);
      await expect(r.connect(ctx.processor).recordReceipt(id, h[1]))
        .to.emit(r, "BatchStateChanged")
        .withArgs(id, State.COLLECTED, State.RECEIVED, ctx.processor.address, h[1]);
      await expect(r.connect(ctx.processor).submitProcessing(id, OUTPUTS, h[2]))
        .to.emit(r, "BatchStateChanged")
        .withArgs(id, State.RECEIVED, State.PROCESSED_CLAIMED, ctx.processor.address, h[2]);
      await expect(r.connect(ctx.verifier).returnBatch(id, ReturnReason.EVIDENCE_UNREADABLE))
        .to.emit(r, "BatchStateChanged")
        .withArgs(id, State.PROCESSED_CLAIMED, State.RETURNED, ctx.verifier.address, h[2]);
      await expect(r.connect(ctx.processor).resubmitProcessing(id, OUTPUTS_V2, h[3]))
        .to.emit(r, "BatchStateChanged")
        .withArgs(id, State.RETURNED, State.PROCESSED_CLAIMED, ctx.processor.address, h[3]);
      await expect(r.connect(ctx.verifier).rejectBatch(id, RejectReason.CHAIN_OF_CUSTODY_BROKEN))
        .to.emit(r, "BatchStateChanged")
        .withArgs(id, State.PROCESSED_CLAIMED, State.REJECTED, ctx.verifier.address, h[3])
        .and.to.emit(r, "BatchRejected")
        .withArgs(id, 1n, RejectReason.CHAIN_OF_CUSTODY_BROKEN);
    });

    it("[T-EVT-02] reverted calls emit no events", async function () {
      const ctx = await load();
      const id = await advanceTo(ctx, "REGISTERED");
      const count = async () => (await ctx.registry.queryFilter(ctx.registry.filters.BatchStateChanged())).length;
      const before = await count();
      await expect(act(ctx, "receipt", id)).to.be.revertedWithCustomError(ctx.registry, "InvalidTransition");
      await expect(act(ctx, "collect", id, ctx.outsider)).to.be.revertedWithCustomError(
        ctx.registry,
        "AccessControlUnauthorizedAccount",
      );
      expect(await count()).to.equal(before);
    });

    it("[T-EVT-03] ABI has no string/bytes inputs in any event or function (no raw serial / personal-data fields)", async function () {
      const { registry } = await load();
      const dynamicText = /^(string|bytes)(\[\])?$/;
      for (const f of registry.interface.fragments) {
        if (f.type !== "event" && f.type !== "function") continue;
        const inputs = (f as unknown as { inputs: { type: string; components?: { type: string }[] }[] }).inputs;
        for (const p of inputs) {
          expect(p.type, `${f.format()} -> ${p.type}`).to.not.match(dynamicText);
          for (const c of p.components ?? []) expect(c.type).to.not.match(dynamicText);
        }
      }
    });

    it("[T-EVT-04] verification event records a verifier distinct from collector and processor", async function () {
      const ctx = await load();
      const id = await advanceTo(ctx, "PROCESSED_CLAIMED");
      const receipt = await (await act(ctx, "verify", id)).wait();
      const parsed = receipt!.logs
        .map((l) => ctx.registry.interface.parseLog(l))
        .find((p) => p?.name === "BatchVerified");
      const verifierAddr = parsed!.args.verifier as string;
      const b = await ctx.registry.getBatch(id);
      expect(verifierAddr).to.equal(ctx.verifier.address);
      expect(verifierAddr).to.not.equal(b.collector);
      expect(verifierAddr).to.not.equal(b.processor);
    });

    it("[T-EVT-05] full batch history and outputs can be reconstructed from events alone", async function () {
      const ctx = await load();
      await advanceTo(ctx, "VERIFIED"); // noise batch
      const id = await advanceTo(ctx, "RETURNED");
      await run(ctx, "resubmit", id);
      await run(ctx, "verify", id);

      const transitions = await ctx.registry.queryFilter(ctx.registry.filters.BatchStateChanged(id));
      expect(transitions.map((e) => [e.args.from, e.args.to])).to.deep.equal([
        [State.NONE, State.REGISTERED],
        [State.REGISTERED, State.COLLECTED],
        [State.COLLECTED, State.RECEIVED],
        [State.RECEIVED, State.PROCESSED_CLAIMED],
        [State.PROCESSED_CLAIMED, State.RETURNED],
        [State.RETURNED, State.PROCESSED_CLAIMED],
        [State.PROCESSED_CLAIMED, State.VERIFIED],
      ]);

      const submissions = await ctx.registry.queryFilter(ctx.registry.filters.ProcessingSubmitted(id));
      expect(submissions.length).to.equal(2);
      for (const e of submissions) {
        const [rev, outs] = await ctx.registry.getRevision(id, e.args.revision);
        expect(e.args.evidenceHash).to.equal(rev.evidenceHash);
        expect(e.args.totalOutputMassGrams).to.equal(rev.totalOutputMassGrams);
        expect(e.args.outputs.map((o) => [o.materialCode, o.massGrams])).to.deep.equal(
          outs.map((o) => [o.materialCode, o.massGrams]),
        );
      }
    });
  });

  // -------------------------------------------------------------------------
  describe("B11. Adversarial & Security Invariant Hardening", function () {
    describe("Registrar authorization & cancellation invariants", function () {
      it("[T-ADV-REG-01] revoking REGISTRAR_ROLE from the batch's registrar prevents cancellation", async function () {
        const ctx = await load();
        const id = await advanceTo(ctx, "REGISTERED");
        await ctx.registry.connect(ctx.admin).revokeRole(ctx.role.REGISTRAR, ctx.registrar.address);
        await expect(ctx.registry.connect(ctx.registrar).cancelBatch(id))
          .to.be.revertedWithCustomError(ctx.registry, "AccessControlUnauthorizedAccount")
          .withArgs(ctx.registrar.address, ctx.role.REGISTRAR);
        expect(await ctx.registry.getState(id)).to.equal(State.REGISTERED);
      });

      it("[T-ADV-REG-02] mutual registrar isolation: registrar1 cannot cancel registrar2's batch and vice versa", async function () {
        const ctx = await load();
        const key1 = newClaimKey();
        await ctx.registry
          .connect(ctx.registrar)
          .registerBatch(key1, CATEGORY, ctx.collector.address, ctx.processor.address, ctx.verifier.address);
        const id1 = await ctx.registry.batchIdByClaimKey(key1);

        const key2 = newClaimKey();
        await ctx.registry
          .connect(ctx.registrar2)
          .registerBatch(key2, CATEGORY, ctx.collector.address, ctx.processor.address, ctx.verifier.address);
        const id2 = await ctx.registry.batchIdByClaimKey(key2);

        // registrar 1 cannot cancel registrar 2's batch
        await expect(ctx.registry.connect(ctx.registrar).cancelBatch(id2))
          .to.be.revertedWithCustomError(ctx.registry, "NotAssignedActor")
          .withArgs(id2, ctx.registrar.address);

        // registrar 2 cannot cancel registrar 1's batch
        await expect(ctx.registry.connect(ctx.registrar2).cancelBatch(id1))
          .to.be.revertedWithCustomError(ctx.registry, "NotAssignedActor")
          .withArgs(id1, ctx.registrar2.address);

        // both remain in REGISTERED state
        expect(await ctx.registry.getState(id1)).to.equal(State.REGISTERED);
        expect(await ctx.registry.getState(id2)).to.equal(State.REGISTERED);
      });

      it("[T-ADV-REG-03] admin granting itself REGISTRAR_ROLE cannot cancel any existing registered batch", async function () {
        const ctx = await load();
        const id = await advanceTo(ctx, "REGISTERED");
        await ctx.registry.connect(ctx.admin).grantRole(ctx.role.REGISTRAR, ctx.admin.address);
        await expect(ctx.registry.connect(ctx.admin).cancelBatch(id))
          .to.be.revertedWithCustomError(ctx.registry, "NotAssignedActor")
          .withArgs(id, ctx.admin.address);
      });

      it("[T-ADV-REG-04] assigned registrar cannot cancel once collection has occurred", async function () {
        const ctx = await load();
        const id = await advanceTo(ctx, "COLLECTED");
        await expect(ctx.registry.connect(ctx.registrar).cancelBatch(id))
          .to.be.revertedWithCustomError(ctx.registry, "InvalidTransition")
          .withArgs(id, State.COLLECTED, State.CANCELLED);
      });

      it("[T-ADV-REG-05] claim key of a cancelled batch cannot be re-registered", async function () {
        const ctx = await load();
        const key = newClaimKey();
        await ctx.registry
          .connect(ctx.registrar)
          .registerBatch(key, CATEGORY, ctx.collector.address, ctx.processor.address, ctx.verifier.address);
        const id = await ctx.registry.batchIdByClaimKey(key);
        await ctx.registry.connect(ctx.registrar).cancelBatch(id);

        await expect(
          ctx.registry
            .connect(ctx.registrar)
            .registerBatch(key, CATEGORY, ctx.collector.address, ctx.processor.address, ctx.verifier.address),
        )
          .to.be.revertedWithCustomError(ctx.registry, "DuplicateClaimKey")
          .withArgs(key);
      });
    });

    describe("Verifier independence adversarial enforcement", function () {
      it("[T-ADV-IND-01] conflicted collector with VERIFIER_ROLE reverts with VerifierNotIndependent at verify", async function () {
        const ctx = await load();
        await ctx.registry.connect(ctx.admin).grantRole(ctx.role.VERIFIER, ctx.collector.address);
        const id = await advanceTo(ctx, "PROCESSED_CLAIMED");
        await expect(ctx.registry.connect(ctx.collector).verifyBatch(id))
          .to.be.revertedWithCustomError(ctx.registry, "VerifierNotIndependent")
          .withArgs(ctx.collector.address);
      });

      it("[T-ADV-IND-02] conflicted processor with VERIFIER_ROLE reverts with VerifierNotIndependent at verify", async function () {
        const ctx = await load();
        await ctx.registry.connect(ctx.admin).grantRole(ctx.role.VERIFIER, ctx.processor.address);
        const id = await advanceTo(ctx, "PROCESSED_CLAIMED");
        await expect(ctx.registry.connect(ctx.processor).verifyBatch(id))
          .to.be.revertedWithCustomError(ctx.registry, "VerifierNotIndependent")
          .withArgs(ctx.processor.address);
      });

      it("[T-ADV-IND-03] conflicted collector or processor cannot return or reject their own batch", async function () {
        const ctx = await load();
        await ctx.registry.connect(ctx.admin).grantRole(ctx.role.VERIFIER, ctx.collector.address);
        await ctx.registry.connect(ctx.admin).grantRole(ctx.role.VERIFIER, ctx.processor.address);
        const id = await advanceTo(ctx, "PROCESSED_CLAIMED");

        await expect(ctx.registry.connect(ctx.collector).returnBatch(id, ReturnReason.INSUFFICIENT_EVIDENCE))
          .to.be.revertedWithCustomError(ctx.registry, "VerifierNotIndependent")
          .withArgs(ctx.collector.address);
        await expect(ctx.registry.connect(ctx.collector).rejectBatch(id, RejectReason.EVIDENCE_INCONSISTENT))
          .to.be.revertedWithCustomError(ctx.registry, "VerifierNotIndependent")
          .withArgs(ctx.collector.address);

        await expect(ctx.registry.connect(ctx.processor).returnBatch(id, ReturnReason.INSUFFICIENT_EVIDENCE))
          .to.be.revertedWithCustomError(ctx.registry, "VerifierNotIndependent")
          .withArgs(ctx.processor.address);
        await expect(ctx.registry.connect(ctx.processor).rejectBatch(id, RejectReason.EVIDENCE_INCONSISTENT))
          .to.be.revertedWithCustomError(ctx.registry, "VerifierNotIndependent")
          .withArgs(ctx.processor.address);
      });

      it("[T-ADV-IND-04] third-party non-conflicted verifier reverts with NotAssignedActor (not VerifierNotIndependent)", async function () {
        const ctx = await load();
        const id = await advanceTo(ctx, "PROCESSED_CLAIMED");
        await expect(ctx.registry.connect(ctx.verifier2).verifyBatch(id))
          .to.be.revertedWithCustomError(ctx.registry, "NotAssignedActor")
          .withArgs(id, ctx.verifier2.address);
      });

      it("[T-ADV-IND-05] integrated facility (collector == processor) is blocked from self-verifying", async function () {
        const ctx = await load();
        await ctx.registry.connect(ctx.admin).grantRole(ctx.role.PROCESSOR, ctx.collector.address);
        await ctx.registry.connect(ctx.admin).grantRole(ctx.role.VERIFIER, ctx.collector.address);

        const key = newClaimKey();
        await ctx.registry
          .connect(ctx.registrar)
          .registerBatch(key, CATEGORY, ctx.collector.address, ctx.collector.address, ctx.verifier.address);
        const id = await ctx.registry.batchIdByClaimKey(key);

        await ctx.registry.connect(ctx.collector).recordCollection(id, INTAKE, newEvidence("int-col"));
        await ctx.registry.connect(ctx.collector).recordReceipt(id, newEvidence("int-rec"));
        await ctx.registry.connect(ctx.collector).submitProcessing(id, OUTPUTS, newEvidence("int-sub"));

        await expect(ctx.registry.connect(ctx.collector).verifyBatch(id))
          .to.be.revertedWithCustomError(ctx.registry, "VerifierNotIndependent")
          .withArgs(ctx.collector.address);

        await expect(ctx.registry.connect(ctx.verifier).verifyBatch(id)).to.emit(ctx.registry, "BatchVerified");
        expect(await ctx.registry.getState(id)).to.equal(State.VERIFIED);
      });
    });

    describe("Duplicate evidence digest adversarial attacks", function () {
      it("[T-ADV-EVD-01] cross-stage digest reuse within the same batch reverts", async function () {
        const ctx = await load();
        const id = await advanceTo(ctx, "REGISTERED");
        const h = newEvidence("reused-stage");
        await ctx.registry.connect(ctx.collector).recordCollection(id, INTAKE, h);
        await expect(ctx.registry.connect(ctx.processor).recordReceipt(id, h))
          .to.be.revertedWithCustomError(ctx.registry, "EvidenceAlreadyUsed")
          .withArgs(h);
      });

      it("[T-ADV-EVD-02] digest used in terminal batch cannot be reused on a new batch", async function () {
        const ctx = await load();
        const id1 = await advanceTo(ctx, "PROCESSED_CLAIMED");
        const b = await ctx.registry.getBatch(id1);
        const collectionHash = b.collectionEvidenceHash;
        await ctx.registry.connect(ctx.verifier).verifyBatch(id1);

        const id2 = await advanceTo(ctx, "REGISTERED");
        await expect(ctx.registry.connect(ctx.collector).recordCollection(id2, INTAKE, collectionHash))
          .to.be.revertedWithCustomError(ctx.registry, "EvidenceAlreadyUsed")
          .withArgs(collectionHash);
      });

      it("[T-ADV-EVD-03] digest from revision 0 cannot be reused in revision 2 after multiple returns", async function () {
        const ctx = await load();
        const id = await advanceTo(ctx, "RECEIVED");
        const h0 = newEvidence("rev-0");
        await ctx.registry.connect(ctx.processor).submitProcessing(id, OUTPUTS, h0);
        await ctx.registry.connect(ctx.verifier).returnBatch(id, ReturnReason.INSUFFICIENT_EVIDENCE);

        const h1 = newEvidence("rev-1");
        await ctx.registry.connect(ctx.processor).resubmitProcessing(id, OUTPUTS_V2, h1);
        await ctx.registry.connect(ctx.verifier).returnBatch(id, ReturnReason.OUTPUT_DATA_INCOMPLETE);

        await expect(ctx.registry.connect(ctx.processor).resubmitProcessing(id, OUTPUTS, h0))
          .to.be.revertedWithCustomError(ctx.registry, "EvidenceAlreadyUsed")
          .withArgs(h0);
      });

      it("[T-ADV-EVD-04] bytes32(0) is rejected across all evidence entry points", async function () {
        const ctx = await load();
        const idReg = await advanceTo(ctx, "REGISTERED");
        await expect(ctx.registry.connect(ctx.collector).recordCollection(idReg, INTAKE, ZERO_HASH))
          .to.be.revertedWithCustomError(ctx.registry, "MissingEvidence");

        const idCol = await advanceTo(ctx, "COLLECTED");
        await expect(ctx.registry.connect(ctx.processor).recordReceipt(idCol, ZERO_HASH))
          .to.be.revertedWithCustomError(ctx.registry, "MissingEvidence");

        const idRec = await advanceTo(ctx, "RECEIVED");
        await expect(ctx.registry.connect(ctx.processor).submitProcessing(idRec, OUTPUTS, ZERO_HASH))
          .to.be.revertedWithCustomError(ctx.registry, "MissingEvidence");

        const idRet = await advanceTo(ctx, "RETURNED");
        await expect(ctx.registry.connect(ctx.processor).resubmitProcessing(idRet, OUTPUTS_V2, ZERO_HASH))
          .to.be.revertedWithCustomError(ctx.registry, "MissingEvidence");
      });
    });

    describe("Invalid state transition & immutability adversarial attacks", function () {
      it("[T-ADV-TR-01] skipping stages from REGISTERED directly to later states reverts", async function () {
        const ctx = await load();
        const id = await advanceTo(ctx, "REGISTERED");
        await expect(act(ctx, "receipt", id))
          .to.be.revertedWithCustomError(ctx.registry, "InvalidTransition")
          .withArgs(id, State.REGISTERED, State.RECEIVED);
        await expect(act(ctx, "submit", id))
          .to.be.revertedWithCustomError(ctx.registry, "InvalidTransition")
          .withArgs(id, State.REGISTERED, State.PROCESSED_CLAIMED);
        await expect(act(ctx, "verify", id))
          .to.be.revertedWithCustomError(ctx.registry, "InvalidTransition")
          .withArgs(id, State.REGISTERED, State.VERIFIED);
      });

      it("[T-ADV-TR-02] premature verification before processing claim reverts", async function () {
        const ctx = await load();
        const idCol = await advanceTo(ctx, "COLLECTED");
        await expect(act(ctx, "verify", idCol))
          .to.be.revertedWithCustomError(ctx.registry, "InvalidTransition")
          .withArgs(idCol, State.COLLECTED, State.VERIFIED);

        const idRec = await advanceTo(ctx, "RECEIVED");
        await expect(act(ctx, "verify", idRec))
          .to.be.revertedWithCustomError(ctx.registry, "InvalidTransition")
          .withArgs(idRec, State.RECEIVED, State.VERIFIED);
      });

      it("[T-ADV-TR-03] backward transitions are strictly forbidden", async function () {
        const ctx = await load();
        const idRec = await advanceTo(ctx, "RECEIVED");
        await expect(act(ctx, "collect", idRec))
          .to.be.revertedWithCustomError(ctx.registry, "InvalidTransition")
          .withArgs(idRec, State.RECEIVED, State.COLLECTED);

        const idClaim = await advanceTo(ctx, "PROCESSED_CLAIMED");
        await expect(act(ctx, "receipt", idClaim))
          .to.be.revertedWithCustomError(ctx.registry, "InvalidTransition")
          .withArgs(idClaim, State.PROCESSED_CLAIMED, State.RECEIVED);
      });

      it("[T-ADV-TR-04] terminal states VERIFIED, REJECTED, CANCELLED accept no mutations across all 8 actions", async function () {
        const ctx = await load();
        const idVer = await advanceTo(ctx, "VERIFIED");
        const idRej = await advanceTo(ctx, "REJECTED");
        const idCan = await advanceTo(ctx, "CANCELLED");

        for (const [id, st] of [
          [idVer, State.VERIFIED],
          [idRej, State.REJECTED],
          [idCan, State.CANCELLED],
        ] as const) {
          const before = await snapshot(ctx, id);
          for (const a of ACTIONS) {
            await expect(act(ctx, a, id))
              .to.be.revertedWithCustomError(ctx.registry, "InvalidTransition")
              .withArgs(id, st, ACTION_TARGET[a]);
          }
          expect(await ctx.registry.getState(id)).to.equal(st);
          expect(await snapshot(ctx, id)).to.equal(before);
        }
      });

      it("[T-ADV-TR-05] returnBatch with valid verifier actor and reason code is rejected against VERIFIED, REJECTED, CANCELLED", async function () {
        const ctx = await load();
        const idVer = await advanceTo(ctx, "VERIFIED");
        const idRej = await advanceTo(ctx, "REJECTED");
        const idCan = await advanceTo(ctx, "CANCELLED");

        for (const [id, st] of [
          [idVer, State.VERIFIED],
          [idRej, State.REJECTED],
          [idCan, State.CANCELLED],
        ] as const) {
          const before = await snapshot(ctx, id);
          const reasons = [
            ReturnReason.INSUFFICIENT_EVIDENCE,
            ReturnReason.EVIDENCE_UNREADABLE,
            ReturnReason.OUTPUT_DATA_INCOMPLETE,
            ReturnReason.MASS_DISCREPANCY,
          ];
          for (const r of reasons) {
            await expect(ctx.registry.connect(ctx.verifier).returnBatch(id, r))
              .to.be.revertedWithCustomError(ctx.registry, "InvalidTransition")
              .withArgs(id, st, State.RETURNED);
          }
          expect(await ctx.registry.getState(id)).to.equal(st);
          expect(await snapshot(ctx, id)).to.equal(before);
        }
      });

      it("[T-ADV-TR-06] rejectBatch with valid verifier actor and reason code is rejected against VERIFIED, REJECTED, CANCELLED", async function () {
        const ctx = await load();
        const idVer = await advanceTo(ctx, "VERIFIED");
        const idRej = await advanceTo(ctx, "REJECTED");
        const idCan = await advanceTo(ctx, "CANCELLED");

        for (const [id, st] of [
          [idVer, State.VERIFIED],
          [idRej, State.REJECTED],
          [idCan, State.CANCELLED],
        ] as const) {
          const before = await snapshot(ctx, id);
          const reasons = [
            RejectReason.EVIDENCE_INCONSISTENT,
            RejectReason.MASS_BALANCE_IMPLAUSIBLE,
            RejectReason.PROCESSOR_NOT_QUALIFIED,
            RejectReason.CHAIN_OF_CUSTODY_BROKEN,
          ];
          for (const r of reasons) {
            await expect(ctx.registry.connect(ctx.verifier).rejectBatch(id, r))
              .to.be.revertedWithCustomError(ctx.registry, "InvalidTransition")
              .withArgs(id, st, State.REJECTED);
          }
          expect(await ctx.registry.getState(id)).to.equal(st);
          expect(await snapshot(ctx, id)).to.equal(before);
        }
      });

      it("[T-ADV-TR-07] resubmitProcessing with valid processor actor, outputs, and fresh evidence is rejected against VERIFIED, REJECTED, CANCELLED", async function () {
        const ctx = await load();
        const idVer = await advanceTo(ctx, "VERIFIED");
        const idRej = await advanceTo(ctx, "REJECTED");
        const idCan = await advanceTo(ctx, "CANCELLED");

        for (const [id, st] of [
          [idVer, State.VERIFIED],
          [idRej, State.REJECTED],
          [idCan, State.CANCELLED],
        ] as const) {
          const before = await snapshot(ctx, id);
          const freshEvidence = newEvidence(`term-resubmit-${st}`);
          await expect(ctx.registry.connect(ctx.processor).resubmitProcessing(id, OUTPUTS_V2, freshEvidence))
            .to.be.revertedWithCustomError(ctx.registry, "InvalidTransition")
            .withArgs(id, st, State.PROCESSED_CLAIMED);
          expect(await ctx.registry.getState(id)).to.equal(st);
          expect(await snapshot(ctx, id)).to.equal(before);
          expect(await ctx.registry.evidenceUsed(freshEvidence)).to.equal(false);
        }
      });
    });

    describe("Mass-balance constraint adversarial bounds", function () {
      it("[T-ADV-MASS-01] output summing to intake + 1 gram reverts with MassBalanceExceeded", async function () {
        const ctx = await load();
        const id = await advanceTo(ctx, "RECEIVED");
        const excessOutputs = [out(1, INTAKE / 2n), out(2, INTAKE / 2n + 1n)];
        await expect(ctx.registry.connect(ctx.processor).submitProcessing(id, excessOutputs, newEvidence()))
          .to.be.revertedWithCustomError(ctx.registry, "MassBalanceExceeded")
          .withArgs(INTAKE + 1n, INTAKE);
      });

      it("[T-ADV-MASS-02] 17 outputs exceeds MAX_OUTPUTS and reverts with TooManyOutputs", async function () {
        const ctx = await load();
        const id = await advanceTo(ctx, "RECEIVED");
        const seventeen = Array.from({ length: 17 }, (_, i) => out(i + 1, 10n));
        await expect(ctx.registry.connect(ctx.processor).submitProcessing(id, seventeen, newEvidence()))
          .to.be.revertedWithCustomError(ctx.registry, "TooManyOutputs")
          .withArgs(17, 16);
      });

      it("[T-ADV-MASS-03] zero mass or zero material code at any position reverts with InvalidOutput", async function () {
        const ctx = await load();
        const id = await advanceTo(ctx, "RECEIVED");
        const badMaterial = [out(1, 100n), { materialCode: 0, massGrams: 50n }];
        await expect(ctx.registry.connect(ctx.processor).submitProcessing(id, badMaterial, newEvidence()))
          .to.be.revertedWithCustomError(ctx.registry, "InvalidOutput")
          .withArgs(1);

        const badMass = [{ materialCode: 1, massGrams: 0n }];
        await expect(ctx.registry.connect(ctx.processor).submitProcessing(id, badMass, newEvidence()))
          .to.be.revertedWithCustomError(ctx.registry, "InvalidOutput")
          .withArgs(0);
      });

      it("[T-ADV-MASS-04] exact mass conservation (sum == intake) succeeds", async function () {
        const ctx = await load();
        const id = await advanceTo(ctx, "RECEIVED");
        const balanced = [out(1, INTAKE / 2n), out(2, INTAKE / 2n)];
        await expect(ctx.registry.connect(ctx.processor).submitProcessing(id, balanced, newEvidence()))
          .to.emit(ctx.registry, "ProcessingSubmitted");
        expect(await ctx.registry.getState(id)).to.equal(State.PROCESSED_CLAIMED);
      });

      it("[T-ADV-MASS-05] sub-intake mass claim (sum < intake) succeeds representing physical loss", async function () {
        const ctx = await load();
        const id = await advanceTo(ctx, "RECEIVED");
        const lossOutputs = [out(1, INTAKE / 3n)];
        await expect(ctx.registry.connect(ctx.processor).submitProcessing(id, lossOutputs, newEvidence()))
          .to.emit(ctx.registry, "ProcessingSubmitted");
        expect(await ctx.registry.getState(id)).to.equal(State.PROCESSED_CLAIMED);
      });
    });
  });
});
