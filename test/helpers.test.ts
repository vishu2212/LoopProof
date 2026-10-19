// Section A helper tests (T-HLP-*). No contract deployment required.
import { expect } from "chai";
import { readFileSync } from "node:fs";
import { isHexString } from "ethers";
import { State, ReturnReason, RejectReason, newClaimKey, newEvidence } from "./helpers/loopproof.js";

function solidityEnumMembers(enumName: string): string[] {
  const src = readFileSync(new URL("../contracts/LoopProofTypes.sol", import.meta.url), "utf8");
  const match = src.match(new RegExp(`enum\\s+${enumName}\\s*\\{([^}]*)\\}`));
  if (!match) throw new Error(`enum ${enumName} not found`);
  return match[1].split(",").map((s) => s.trim()).filter(Boolean);
}

describe("Test helpers (section A)", function () {
  it("[T-HLP-01] evidence hash generator never repeats and yields bytes32", function () {
    const seen = new Set<string>();
    for (let i = 0; i < 500; i++) {
      const h = newEvidence("same-label");
      expect(isHexString(h, 32)).to.equal(true);
      expect(seen.has(h)).to.equal(false);
      seen.add(h);
    }
  });

  it("[T-HLP-02] claim keys are opaque bytes32 and do not contain the raw label", function () {
    const raw = "SERIAL-ABC-123";
    const key = newClaimKey(raw);
    expect(isHexString(key, 32)).to.equal(true);
    const rawHex = Buffer.from(raw, "utf8").toString("hex");
    expect(key.toLowerCase()).to.not.contain(rawHex.toLowerCase());
    expect(newClaimKey(raw)).to.not.equal(key);
  });

  it("[T-HLP-03] TS enum mirrors match Solidity enum order", function () {
    expect(solidityEnumMembers("BatchState")).to.deep.equal(Object.keys(State));
    Object.values(State).forEach((v, i) => expect(v).to.equal(BigInt(i)));
    expect(solidityEnumMembers("ReturnReason")).to.deep.equal(Object.keys(ReturnReason));
    expect(solidityEnumMembers("RejectReason")).to.deep.equal(Object.keys(RejectReason));
  });
});
