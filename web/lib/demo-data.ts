import type {
  BatchState,
  RejectReason,
  ReturnReason,
} from "./lifecycle";

/**
 * SYNTHETIC DEMO DATA — NOT REAL. This file is the single source for every demo
 * batch: the dashboard and the /batches/[batchId] pages both read from it.
 *
 * Nothing here comes from a backend, database, or blockchain. Names, timestamps,
 * masses and hashes are invented for UI demonstration only. Hash values are
 * placeholders in the form `sha256:xxxx…yyyy`; they are NOT SHA-256 digests of
 * any real file.
 *
 * Keep this module free of runtime imports (type imports only) so Node's test
 * runner can load it directly.
 */
export const DEMO_DATA_NOTICE =
  "Synthetic demo data. Not connected to a backend, database, or blockchain.";

export type EvidenceRecord = {
  id: string;
  kind: "Collection record" | "Receipt record" | "Processing claim";
  /** Role label of the submitter. Synthetic. */
  submitter: string;
  submittedAt: string;
  /** Placeholder only — NOT a real SHA-256 digest. Format: sha256:xxxx…yyyy */
  hashPlaceholder: string;
  note: string;
};

export type TimelineEvent = {
  id: string;
  type: "transition" | "review-status";
  /** Set for lifecycle transitions: the state entered. */
  toState?: Exclude<BatchState, "NONE">;
  title: string;
  description: string;
  actor: string;
  at: string;
};

export type OutcomeRecord =
  | { kind: "returned"; reason: ReturnReason; by: string; at: string }
  | { kind: "rejected"; reason: RejectReason; by: string; at: string };

/** A public emission/impact factor with a citation. None are provided in this demo. */
export type CitedFactor = { name: string; source: string; url: string };

export type DemoBatch = {
  id: string;
  category: string;
  state: Exclude<BatchState, "NONE">;
  collector: string;
  processor: string;
  verifier: string;
  /** Grams, as in the contract's mass-balance rule. Synthetic. 0 = not collected. */
  intakeMassGrams: number;
  lastUpdated: string;
  /** Latest claimed outputs, in grams. Empty until a processing claim exists. */
  outputsGrams: { material: string; grams: number }[];
  evidence: EvidenceRecord[];
  timeline: TimelineEvent[];
  /** Present only for RETURNED and REJECTED batches. */
  outcome?: OutcomeRecord;
  /** Publicly cited factors that would be required for any impact estimate. */
  citedFactors: CitedFactor[];
};

const COLLECTOR = "Collector A (demo)";
const PROCESSOR = "Processor B (demo)";
const VERIFIER = "Verifier C (demo)";
const REGISTRAR = "Registrar (demo)";

const NOTE_FILE = "Placeholder hash. Evidence file stays off-chain.";
const NOTE_CLAIM = "Placeholder hash. A processing claim, not proof of recycling.";

const collection = (id: string, at: string, hash: string): EvidenceRecord => ({
  id: `EV-${id}-A`,
  kind: "Collection record",
  submitter: COLLECTOR,
  submittedAt: at,
  hashPlaceholder: hash,
  note: NOTE_FILE,
});
const receipt = (id: string, at: string, hash: string): EvidenceRecord => ({
  id: `EV-${id}-B`,
  kind: "Receipt record",
  submitter: PROCESSOR,
  submittedAt: at,
  hashPlaceholder: hash,
  note: NOTE_FILE,
});
const claim = (id: string, at: string, hash: string): EvidenceRecord => ({
  id: `EV-${id}-C`,
  kind: "Processing claim",
  submitter: PROCESSOR,
  submittedAt: at,
  hashPlaceholder: hash,
  note: NOTE_CLAIM,
});

const registered = (id: string, at: string): TimelineEvent => ({
  id: `${id}-T1`,
  type: "transition",
  toState: "REGISTERED",
  title: "Registered",
  description: "Batch registered with assigned collector, processor and verifier.",
  actor: REGISTRAR,
  at,
});
const collected = (id: string, at: string): TimelineEvent => ({
  id: `${id}-T2`,
  type: "transition",
  toState: "COLLECTED",
  title: "Collected",
  description: "Collector recorded intake mass and collection evidence.",
  actor: COLLECTOR,
  at,
});
const received = (id: string, at: string): TimelineEvent => ({
  id: `${id}-T3`,
  type: "transition",
  toState: "RECEIVED",
  title: "Received",
  description: "Processor recorded receipt evidence.",
  actor: PROCESSOR,
  at,
});
const claimed = (id: string, at: string): TimelineEvent => ({
  id: `${id}-T4`,
  type: "transition",
  toState: "PROCESSED_CLAIMED",
  title: "Processing claimed",
  description: "Processor submitted its output set and processing evidence.",
  actor: PROCESSOR,
  at,
});

export const DEMO_BATCHES: DemoBatch[] = [
  {
    id: "DEMO-001",
    category: "Laptops (demo)",
    state: "REGISTERED",
    collector: COLLECTOR,
    processor: PROCESSOR,
    verifier: VERIFIER,
    intakeMassGrams: 0,
    lastUpdated: "2026-10-12T09:15:00Z",
    outputsGrams: [],
    evidence: [],
    timeline: [registered("DEMO-001", "2026-10-12T09:15:00Z")],
    citedFactors: [],
  },
  {
    id: "DEMO-002",
    category: "Mixed small electronics (demo)",
    state: "PROCESSED_CLAIMED",
    collector: COLLECTOR,
    processor: PROCESSOR,
    verifier: VERIFIER,
    intakeMassGrams: 10000,
    lastUpdated: "2026-10-16T15:42:00Z",
    outputsGrams: [
      { material: "Material code 1 (demo)", grams: 6000 },
      { material: "Material code 2 (demo)", grams: 3000 },
    ],
    evidence: [
      collection("DEMO-002", "2026-10-13T08:20:00Z", "sha256:3f9a…c21d"),
      receipt("DEMO-002", "2026-10-14T10:05:00Z", "sha256:b71e…09fa"),
      claim("DEMO-002", "2026-10-16T15:42:00Z", "sha256:5d02…e7b8"),
    ],
    timeline: [
      registered("DEMO-002", "2026-10-12T09:00:00Z"),
      collected("DEMO-002", "2026-10-13T08:20:00Z"),
      received("DEMO-002", "2026-10-14T10:05:00Z"),
      claimed("DEMO-002", "2026-10-16T15:42:00Z"),
      {
        id: "DEMO-002-R1",
        type: "review-status",
        title: "Pending verifier review",
        description:
          "Review status, not a lifecycle stage. The batch remains in PROCESSED_CLAIMED until the assigned verifier acts.",
        actor: VERIFIER,
        at: "2026-10-16T15:42:00Z",
      },
    ],
    citedFactors: [],
  },
  {
    id: "DEMO-003",
    category: "Monitors (demo)",
    state: "RECEIVED",
    collector: COLLECTOR,
    processor: PROCESSOR,
    verifier: VERIFIER,
    intakeMassGrams: 24500,
    lastUpdated: "2026-10-14T11:05:00Z",
    outputsGrams: [],
    evidence: [
      collection("DEMO-003", "2026-10-12T08:00:00Z", "sha256:8c41…77ad"),
      receipt("DEMO-003", "2026-10-14T11:05:00Z", "sha256:2e90…f1c3"),
    ],
    timeline: [
      registered("DEMO-003", "2026-10-10T09:00:00Z"),
      collected("DEMO-003", "2026-10-12T08:00:00Z"),
      received("DEMO-003", "2026-10-14T11:05:00Z"),
    ],
    citedFactors: [],
  },
  {
    id: "DEMO-004",
    category: "Phones (demo)",
    state: "RETURNED",
    collector: COLLECTOR,
    processor: PROCESSOR,
    verifier: VERIFIER,
    intakeMassGrams: 3200,
    lastUpdated: "2026-10-15T08:30:00Z",
    outputsGrams: [
      { material: "Material code 1 (demo)", grams: 1800 },
      { material: "Material code 2 (demo)", grams: 1000 },
    ],
    evidence: [
      collection("DEMO-004", "2026-10-09T08:30:00Z", "sha256:a1d7…4b20"),
      receipt("DEMO-004", "2026-10-11T10:00:00Z", "sha256:6f35…d98e"),
      claim("DEMO-004", "2026-10-13T14:00:00Z", "sha256:c802…13fb"),
    ],
    timeline: [
      registered("DEMO-004", "2026-10-08T09:00:00Z"),
      collected("DEMO-004", "2026-10-09T08:30:00Z"),
      received("DEMO-004", "2026-10-11T10:00:00Z"),
      claimed("DEMO-004", "2026-10-13T14:00:00Z"),
      {
        id: "DEMO-004-T5",
        type: "transition",
        toState: "RETURNED",
        title: "Returned for more evidence",
        description:
          "Verifier returned the claim. The processor must submit new evidence before resubmitting.",
        actor: VERIFIER,
        at: "2026-10-15T08:30:00Z",
      },
      {
        id: "DEMO-004-R1",
        type: "review-status",
        title: "Awaiting resubmission",
        description: "Review status. Waiting for the processor to resubmit with new evidence.",
        actor: PROCESSOR,
        at: "2026-10-15T08:30:00Z",
      },
    ],
    outcome: {
      kind: "returned",
      reason: "INSUFFICIENT_EVIDENCE",
      by: VERIFIER,
      at: "2026-10-15T08:30:00Z",
    },
    citedFactors: [],
  },
  {
    id: "DEMO-005",
    category: "Printers (demo)",
    state: "VERIFIED",
    collector: COLLECTOR,
    processor: PROCESSOR,
    verifier: VERIFIER,
    intakeMassGrams: 8800,
    lastUpdated: "2026-10-10T17:20:00Z",
    outputsGrams: [
      { material: "Material code 1 (demo)", grams: 5000 },
      { material: "Material code 2 (demo)", grams: 3200 },
    ],
    evidence: [
      collection("DEMO-005", "2026-10-02T08:00:00Z", "sha256:9b3c…e540"),
      receipt("DEMO-005", "2026-10-04T09:30:00Z", "sha256:40ee…8a71"),
      claim("DEMO-005", "2026-10-07T13:15:00Z", "sha256:d7a9…26c4"),
    ],
    timeline: [
      registered("DEMO-005", "2026-10-01T09:00:00Z"),
      collected("DEMO-005", "2026-10-02T08:00:00Z"),
      received("DEMO-005", "2026-10-04T09:30:00Z"),
      claimed("DEMO-005", "2026-10-07T13:15:00Z"),
      {
        id: "DEMO-005-T5",
        type: "transition",
        toState: "VERIFIED",
        title: "Verified",
        description:
          "Assigned verifier accepted the processing claim. This records the verifier's decision; it is not proof that physical recycling occurred.",
        actor: VERIFIER,
        at: "2026-10-10T17:20:00Z",
      },
    ],
    // No public factors are cited in this demo, so no impact estimate is available
    // even though this batch is VERIFIED.
    citedFactors: [],
  },
  {
    id: "DEMO-006",
    category: "Cables (demo)",
    state: "CANCELLED",
    collector: COLLECTOR,
    processor: PROCESSOR,
    verifier: VERIFIER,
    intakeMassGrams: 0,
    lastUpdated: "2026-10-09T13:00:00Z",
    outputsGrams: [],
    evidence: [],
    timeline: [
      registered("DEMO-006", "2026-10-08T10:00:00Z"),
      {
        id: "DEMO-006-T2",
        type: "transition",
        toState: "CANCELLED",
        title: "Cancelled",
        description: "Withdrawn by the registrar before collection.",
        actor: REGISTRAR,
        at: "2026-10-09T13:00:00Z",
      },
    ],
    citedFactors: [],
  },
  {
    id: "DEMO-007",
    category: "Tablets (demo)",
    state: "REJECTED",
    collector: COLLECTOR,
    processor: PROCESSOR,
    verifier: VERIFIER,
    intakeMassGrams: 4100,
    lastUpdated: "2026-10-11T10:10:00Z",
    outputsGrams: [
      { material: "Material code 1 (demo)", grams: 2500 },
      { material: "Material code 2 (demo)", grams: 1500 },
    ],
    evidence: [
      collection("DEMO-007", "2026-10-05T08:00:00Z", "sha256:7a12…9fd0"),
      receipt("DEMO-007", "2026-10-07T10:45:00Z", "sha256:0bc5…3e68"),
      claim("DEMO-007", "2026-10-09T12:00:00Z", "sha256:f4d2…a519"),
    ],
    timeline: [
      registered("DEMO-007", "2026-10-03T09:00:00Z"),
      collected("DEMO-007", "2026-10-05T08:00:00Z"),
      received("DEMO-007", "2026-10-07T10:45:00Z"),
      claimed("DEMO-007", "2026-10-09T12:00:00Z"),
      {
        id: "DEMO-007-T5",
        type: "transition",
        toState: "REJECTED",
        title: "Rejected",
        description: "Verifier rejected the processing claim. Terminal outcome.",
        actor: VERIFIER,
        at: "2026-10-11T10:10:00Z",
      },
    ],
    outcome: {
      kind: "rejected",
      reason: "EVIDENCE_INCONSISTENT",
      by: VERIFIER,
      at: "2026-10-11T10:10:00Z",
    },
    citedFactors: [],
  },
];

/** Case-sensitive exact lookup; unknown or malformed IDs return undefined. */
export function getBatch(id: string): DemoBatch | undefined {
  return DEMO_BATCHES.find((b) => b.id === id);
}

/** IDs used by the dynamic route's generateStaticParams. */
export function getStaticBatchIds(): string[] {
  return DEMO_BATCHES.map((b) => b.id);
}

export type ChecklistItem = { id: string; label: string };

/** Shared checklist shown for batches awaiting verifier review. Synthetic/illustrative. */
export const REVIEW_CHECKLIST: ChecklistItem[] = [
  { id: "c1", label: "Collection, receipt and processing evidence hashes are present and distinct." },
  { id: "c2", label: "Evidence files were opened and match their recorded hashes (done off-chain)." },
  { id: "c3", label: "Output masses do not exceed the recorded intake mass." },
  { id: "c4", label: "Verifier is independent of the collector and processor." },
  { id: "c5", label: "Any gaps in chain of custody have been noted." },
];
