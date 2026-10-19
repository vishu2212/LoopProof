// Milestone 0 baseline: verifies the local toolchain only.
// It does NOT test any LoopProof contract behaviour (none exists yet).
import { expect } from "chai";
import { network } from "hardhat";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { ethers } = await network.create();

describe("Toolchain baseline (Milestone 0)", function () {
  it("connects to the local simulated Hardhat network (chainId 31337)", async function () {
    const { chainId } = await ethers.provider.getNetwork();
    expect(chainId).to.equal(31337n);
  });

  it("provides at least 5 local signers for role separation tests", async function () {
    // admin, registrar/collector, processor, verifier, outsider
    const signers = await ethers.getSigners();
    expect(signers.length).to.be.greaterThanOrEqual(5);
  });

  it("has OpenZeppelin contracts installed and resolvable", function () {
    const path = require.resolve("@openzeppelin/contracts/access/AccessControl.sol");
    expect(path).to.be.a("string").and.not.equal("");
  });

  it("computes SHA-256 as bytes32-compatible hex (evidence hashing format)", function () {
    const digest = ethers.sha256(ethers.toUtf8Bytes("abc"));
    // Standard SHA-256 test vector for "abc"
    expect(digest).to.equal(
      "0xba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    expect(ethers.getBytes(digest).length).to.equal(32);
  });
});
