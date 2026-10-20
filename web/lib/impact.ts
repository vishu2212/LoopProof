import type { BatchState } from "./lifecycle";
import type { CitedFactor, EvidenceRecord } from "./demo-data";

export type ImpactStatus =
  | { kind: "unavailable"; reason: string }
  /** Eligible in principle. This prototype has no calculator, so no figure is produced. */
  | { kind: "eligible-not-implemented"; reason: string };

/**
 * Gate for environmental impact. An estimate may only be considered when the batch
 * is VERIFIED, the full evidence set exists, AND at least one public factor is
 * cited. This function never returns a number; no impact calculator exists here.
 */
export function impactStatus(input: {
  state: BatchState;
  evidence: Pick<EvidenceRecord, "kind">[];
  citedFactors: CitedFactor[];
}): ImpactStatus {
  if (input.state !== "VERIFIED") {
    return {
      kind: "unavailable",
      reason: "Unavailable until independent verification (state must be VERIFIED).",
    };
  }
  const kinds = new Set(input.evidence.map((e) => e.kind));
  const complete =
    kinds.has("Collection record") && kinds.has("Receipt record") && kinds.has("Processing claim");
  if (!complete) {
    return { kind: "unavailable", reason: "Unavailable: the required evidence set is incomplete." };
  }
  if (input.citedFactors.length === 0) {
    return {
      kind: "unavailable",
      reason: "Unavailable: verified, but no cited public factors are available in this demo.",
    };
  }
  return {
    kind: "eligible-not-implemented",
    reason: "Eligible in principle, but no impact calculator exists in this prototype.",
  };
}
