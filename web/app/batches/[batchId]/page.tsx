import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CopyableHash } from "@/components/CopyableHash";
import { LifecycleStepper } from "@/components/LifecycleStepper";
import { ReviewChecklist } from "@/components/ReviewChecklist";
import { StateBadge } from "@/components/StateBadge";
import {
  DEMO_BATCHES,
  DEMO_DATA_NOTICE,
  REVIEW_CHECKLIST,
  getBatch,
  getStaticBatchIds,
} from "@/lib/demo-data";
import { formatGrams, formatUtc } from "@/lib/format";
import { impactStatus } from "@/lib/impact";
import { REASON_MEANING, reviewStatusFor, type BatchState } from "@/lib/lifecycle";

type Params = { batchId: string };

export function generateStaticParams(): Params[] {
  return getStaticBatchIds().map((batchId) => ({ batchId }));
}

// Any ID not generated above is a real 404.
export const dynamicParams = false;

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { batchId } = await params;
  return { title: `Batch ${batchId}` };
}

function getWorkflowGuidance(state: BatchState, collector: string, processor: string, verifier: string, returnReason?: string, rejectReason?: string) {
  switch (state) {
    case "REGISTERED":
      return {
        responsible: `Assigned Collector (${collector})`,
        title: "Awaiting physical intake and collection evidence",
        action: "The collector must physically collect the e-waste lot, record certified scale weight, and anchor a Collection Record with scale slip hash before advancing to COLLECTED.",
        constraint: "Mass balance and custody transfer remain locked until physical collection is anchored.",
        tone: "progress",
      };
    case "COLLECTED":
      return {
        responsible: `Assigned Processor (${processor})`,
        title: "Awaiting receiving dock confirmation",
        action: "The processor must confirm arrival at the processing facility, verify tamper seals, and upload a Facility Receipt Record to advance to RECEIVED.",
        constraint: "Processing claim cannot be lodged prior to confirmed receipt.",
        tone: "progress",
      };
    case "RECEIVED":
      return {
        responsible: `Assigned Processor (${processor})`,
        title: "Awaiting processing claim & mass-balance submission",
        action: "The processor must complete sorting, shredding, and material separation, then lodge a Processing Claim detailing recovered mass fractions (copper, circuit boards, plastics).",
        constraint: "Total recovered mass must not exceed intake mass (conservation of mass rule).",
        tone: "progress",
      };
    case "PROCESSED_CLAIMED":
      return {
        responsible: `Independent Verifier (${verifier})`,
        title: "Action Required: Independent verifier audit pending",
        action: "The assigned independent verifier must audit evidence integrity, review mass balance sheets, and anchor an on-chain decision: VERIFY, RETURN, or REJECT.",
        constraint: "Independent verifier must be distinct from both collector and processor (STATE_MACHINE rule 3).",
        tone: "claim",
      };
    case "RETURNED":
      return {
        responsible: `Assigned Processor (${processor})`,
        title: "Action Required: Rectification and resubmission needed",
        action: `Verifier returned batch for reason: ${returnReason ?? "Documentation discrepancy"}. Processor must resolve discrepancy and submit new evidence revision.`,
        constraint: "Resubmission increments revision counter and requires fresh verifier approval.",
        tone: "warn",
      };
    case "REJECTED":
      return {
        responsible: "Terminal State — Final Decision",
        title: "Batch rejected by independent verifier",
        action: `Verifier rejected batch for reason: ${rejectReason ?? "Non-compliance"}. Terminal state reached; no further custody transitions or impact claims permitted.`,
        constraint: "Rejection is irreversible in the state machine (Rule D-14).",
        tone: "bad",
      };
    case "VERIFIED":
      return {
        responsible: "Independent Verification Complete",
        title: "Lifecycle verified by independent audit",
        action: "Chain of custody, stage evidence hashes, and mass balance are independently verified and anchored.",
        constraint: "Impact Gate: Environmental impact figures remain gated until backed by cited public factors.",
        tone: "ok",
      };
    case "CANCELLED":
      return {
        responsible: "Registrar (Pre-Collection Terminal Event)",
        title: "Batch cancelled prior to collection",
        action: "The registrar cancelled this batch before physical pickup occurred. No collection slips or processing claims were generated.",
        constraint: "Cancellation is terminal before collection; custody handoffs remain closed (STATE_MACHINE rule 2).",
        tone: "neutral",
      };
    default:
      return {
        responsible: "Custodian",
        title: "Batch in progress",
        action: "Awaiting next lifecycle progression.",
        constraint: "Evidence required at every transition.",
        tone: "neutral",
      };
  }
}

export default async function BatchDetailPage({ params }: { params: Promise<Params> }) {
  const { batchId } = await params;
  const batch = getBatch(batchId);
  if (!batch) notFound();

  const review = reviewStatusFor(batch.state);
  const outputsTotal = batch.outputsGrams.reduce((s, o) => s + o.grams, 0);
  const unrecoveredGrams =
    batch.intakeMassGrams > 0 && batch.outputsGrams.length > 0
      ? batch.intakeMassGrams - outputsTotal
      : 0;
  const impact = impactStatus(batch);
  const awaitingReview = batch.state === "PROCESSED_CLAIMED";

  const guidance = getWorkflowGuidance(
    batch.state,
    batch.collector,
    batch.processor,
    batch.verifier,
    batch.outcome?.kind === "returned" ? batch.outcome.reason : undefined,
    batch.outcome?.kind === "rejected" ? batch.outcome.reason : undefined,
  );

  const recoveryPct =
    batch.intakeMassGrams > 0 && outputsTotal > 0
      ? Math.round((outputsTotal / batch.intakeMassGrams) * 100)
      : 0;

  return (
    <div className="page">
      <div className="detail-topbar">
        <nav aria-label="Breadcrumb" className="breadcrumb">
          <Link href="/" className="breadcrumb__back">
            ← Overview
          </Link>
          <span aria-hidden="true" className="breadcrumb__sep">/</span>
          <span aria-current="page" className="breadcrumb__current">{batch.id}</span>
        </nav>

        <nav aria-label="Switch demo batch" className="batch-switcher">
          <span className="batch-switcher__label">Demo batch:</span>
          <ul className="batch-switcher__list">
            {DEMO_BATCHES.map((b) => (
              <li key={b.id}>
                <Link
                  href={`/batches/${b.id}`}
                  className={`batch-switcher__pill ${b.id === batch.id ? "is-active" : ""}`}
                  aria-current={b.id === batch.id ? "page" : undefined}
                >
                  {b.id}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      <div className="detail-demo-disclosure" role="note">
        <strong>SYNTHETIC DEMO</strong> Prototype only. Backend and blockchain are not connected.
        All identifiers, hashes, and mass figures below are demonstration placeholders.
      </div>

      <header className="detail-header card">
        <div className="detail-header__main">
          <div className="detail-header__title-row">
            <h1>Batch {batch.id}</h1>
            <StateBadge state={batch.state} />
            <span
              className={`review-pill ${
                review === "Pending verifier review"
                  ? "review-pill--pending"
                  : review === "Awaiting resubmission"
                    ? "review-pill--returned"
                    : review === "Review complete"
                      ? "review-pill--done"
                      : "review-pill--neutral"
              }`}
            >
              Review status: {review}
            </span>
          </div>
          <p className="detail-header__category">{batch.category}</p>
          <p className="lede">
            <strong>{DEMO_DATA_NOTICE}</strong> Names, times, masses and hashes below are invented.
          </p>
        </div>

        <div className="detail-header__meta">
          <div className="detail-stat">
            <span className="detail-stat__label">Recorded Intake</span>
            <strong className="detail-stat__value">
              {batch.intakeMassGrams > 0 ? `${(batch.intakeMassGrams / 1000).toFixed(1)} kg (${formatGrams(batch.intakeMassGrams)})` : "Not collected"}
            </strong>
          </div>
          <div className="detail-stat">
            <span className="detail-stat__label">Claimed Output</span>
            <strong className="detail-stat__value">
              {batch.outputsGrams.length > 0 ? `${(outputsTotal / 1000).toFixed(1)} kg (${formatGrams(outputsTotal)})` : "No claim yet"}
            </strong>
          </div>
          <div className="detail-stat">
            <span className="detail-stat__label">Last Updated (UTC)</span>
            <strong className="detail-stat__value">
              <time dateTime={batch.lastUpdated}>{formatUtc(batch.lastUpdated)}</time>
            </strong>
          </div>
        </div>
      </header>

      {/* Next Action & Workflow Guidance Banner */}
      <section className={`workflow-guidance-card workflow-guidance-card--${guidance.tone}`} aria-label="Workflow next step guidance">
        <div className="workflow-guidance-card__header">
          <span className="workflow-guidance-card__badge">NEXT WORKFLOW STAGE</span>
          <span className="workflow-guidance-card__actor">Responsible: <strong>{guidance.responsible}</strong></span>
        </div>
        <h2 className="workflow-guidance-card__title">{guidance.title}</h2>
        <p className="workflow-guidance-card__action">{guidance.action}</p>
        <div className="workflow-guidance-card__rule">
          <span className="workflow-guidance-card__rule-icon" aria-hidden="true">
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z" />
              <path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z" />
              <path d="M7 21h10" />
              <path d="M12 3v18" />
              <path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2" />
            </svg>
          </span>
          <span><strong>Integrity Gate:</strong> {guidance.constraint}</span>
        </div>
      </section>

      {batch.outcome ? (
        <section
          className={`card outcome outcome--${batch.outcome.kind}`}
          aria-labelledby="outcome-title"
        >
          <div className="card__header">
            <h2 id="outcome-title">
              {batch.outcome.kind === "returned"
                ? "Verifier Return Reason (Resubmission Required)"
                : "Verifier Rejection Reason (Terminal Outcome)"}
            </h2>
            <span className="badge-pill">Contract Reason Code</span>
          </div>
          <p className="outcome__reason">
            <code>{batch.outcome.reason}</code> — {REASON_MEANING[batch.outcome.reason]}
          </p>
          <p className="muted">
            Recorded by {batch.outcome.by} ·{" "}
            <time dateTime={batch.outcome.at}>{formatUtc(batch.outcome.at)}</time> (synthetic).
            {batch.outcome.kind === "returned"
              ? " The processor must submit new evidence before resubmitting."
              : " Rejection is terminal."}
          </p>
        </section>
      ) : null}

      <section className="card" aria-labelledby="summary-title">
        <div className="card__header">
          <div>
            <h2 id="summary-title">Batch Summary &amp; Custody Assignments</h2>
            <p className="muted card__subtitle">
              Assigned actors are separated from verifier judgment. Environmental impact remains
              gated until independent verification and cited public factors exist.
            </p>
          </div>
        </div>
        <dl className="summary-grid">
          <div className="summary-cell">
            <dt>Lifecycle state</dt>
            <dd>
              <StateBadge state={batch.state} />
            </dd>
          </div>
          <div className="summary-cell">
            <dt>Review status</dt>
            <dd>
              {review === "Not applicable" ? "Not applicable" : review}
              <span className="muted"> (status, not a stage)</span>
            </dd>
          </div>
          <div className="summary-cell">
            <dt>Collector</dt>
            <dd>{batch.collector}</dd>
          </div>
          <div className="summary-cell">
            <dt>Processor (locked at registration)</dt>
            <dd>{batch.processor}</dd>
          </div>
          <div className="summary-cell">
            <dt>Assigned verifier (independent)</dt>
            <dd>{batch.verifier}</dd>
          </div>
          <div className="summary-cell">
            <dt>Recorded intake mass</dt>
            <dd>
              {batch.intakeMassGrams > 0 ? formatGrams(batch.intakeMassGrams) : "Not collected yet"}
            </dd>
          </div>
          <div className="summary-cell">
            <dt>Claimed output mass</dt>
            <dd>
              {batch.outputsGrams.length > 0 ? (
                <>
                  {formatGrams(outputsTotal)}{" "}
                  <span className="muted">(claim; must not exceed intake)</span>
                </>
              ) : (
                "No processing claim yet"
              )}
            </dd>
          </div>
          <div className="summary-cell">
            <dt>Environmental impact</dt>
            <dd>{impact.kind === "unavailable" ? "Unavailable" : "Not calculated"}</dd>
          </div>
        </dl>
        <div className="impact-callout" role="note">
          <strong>Impact gate:</strong> {impact.reason} No impact figure is shown or estimated.
        </div>
      </section>

      <section className="card" aria-labelledby="lifecycle-title">
        <div className="card__header">
          <div>
            <h2 id="lifecycle-title">Canonical Lifecycle &amp; Alternative Outcomes</h2>
            <p className="muted card__subtitle">
              Five canonical happy-path stages with separate non-happy-path outcomes.
            </p>
          </div>
        </div>
        <LifecycleStepper current={batch.state} />
      </section>

      <div className="detail-split">
        <section className="card detail-split__main" aria-labelledby="evidence-title">
          <div className="card__header">
            <div>
              <h2 id="evidence-title">Evidence Records</h2>
              <p className="muted card__subtitle">
                Evidence files stay off-chain. Only SHA-256 hashes would be anchored. The values
                shown are <strong>placeholders</strong>, not digests of real files.
              </p>
            </div>
            <span className="badge-pill">{batch.evidence.length} of 3 stage records</span>
          </div>

          {batch.evidence.length === 0 ? (
            <p className="empty-state">No evidence has been recorded for this batch yet.</p>
          ) : (
            <div className="table-wrap" role="region" aria-labelledby="evidence-title" tabIndex={0}>
              <table>
                <caption className="visually-hidden">Evidence records for batch {batch.id}</caption>
                <thead>
                  <tr>
                    <th scope="col">Record</th>
                    <th scope="col">Submitted by</th>
                    <th scope="col">Submitted at</th>
                    <th scope="col">Hash (placeholder)</th>
                    <th scope="col">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {batch.evidence.map((e) => (
                    <tr key={e.id}>
                      <th scope="row">
                        {e.kind}
                        <span className="muted block">{e.id}</span>
                      </th>
                      <td>{e.submitter}</td>
                      <td>
                        <time dateTime={e.submittedAt}>{formatUtc(e.submittedAt)}</time>
                      </td>
                      <td>
                        <CopyableHash hash={e.hashPlaceholder} label={`Evidence ${e.id} hash`} />
                      </td>
                      <td>{e.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {batch.outputsGrams.length > 0 ? (
            <div className="outputs-subpanel" aria-labelledby="outputs-title">
              <h3 id="outputs-title">Claimed processing outputs (mass-balance check)</h3>
              <p className="muted">
                A processor claim, in grams. Synthetic.{" "}
                {batch.state === "VERIFIED"
                  ? "The verifier accepted this claim; that is a recorded decision, not proof of physical recycling."
                  : "Not verified."}
              </p>

              {/* Visual Mass Balance Bar */}
              <div className="mass-balance-visual">
                <div className="mass-balance-visual__header">
                  <span><strong>Mass Balance Audit:</strong> {(outputsTotal / 1000).toFixed(1)} kg ({formatGrams(outputsTotal)}) recovered of {(batch.intakeMassGrams / 1000).toFixed(1)} kg ({formatGrams(batch.intakeMassGrams)}) intake ({recoveryPct}%)</span>
                  <span className="mass-balance-visual__status">
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                      style={{ display: "inline-block", verticalAlign: "middle", marginRight: "3px" }}
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    Validated (Output ≤ Intake)
                  </span>
                </div>
                <div
                  className="mass-balance-visual__bar"
                  role="progressbar"
                  aria-valuenow={recoveryPct}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuetext={`${recoveryPct}% recovered (${(outputsTotal / 1000).toFixed(1)} kg of ${(batch.intakeMassGrams / 1000).toFixed(1)} kg intake)`}
                >
                  <div
                    className="mass-balance-visual__fill mass-balance-visual__fill--recovered"
                    style={{ width: `${Math.min(100, recoveryPct)}%` }}
                    title={`Recovered material: ${formatGrams(outputsTotal)} (${recoveryPct}%)`}
                  />
                  {unrecoveredGrams > 0 ? (
                    <div
                      className="mass-balance-visual__fill mass-balance-visual__fill--loss"
                      style={{ width: `${Math.max(0, 100 - recoveryPct)}%` }}
                      title={`Process loss: ${formatGrams(unrecoveredGrams)} (${100 - recoveryPct}%)`}
                    />
                  ) : null}
                </div>
                <div className="mass-balance-visual__legend">
                  <span className="mass-balance-visual__legend-item">
                    <span className="mass-balance-visual__color mass-balance-visual__color--recovered" />
                    Recovered Fractions ({formatGrams(outputsTotal)})
                  </span>
                  {unrecoveredGrams > 0 ? (
                    <span className="mass-balance-visual__legend-item">
                      <span className="mass-balance-visual__color mass-balance-visual__color--loss" />
                      Unrecovered Loss / Residue ({formatGrams(unrecoveredGrams)})
                    </span>
                  ) : null}
                </div>
              </div>

              <ul className="outputs-list">
                {batch.outputsGrams.map((o) => (
                  <li key={o.material} className="outputs-list__item">
                    <span>{o.material}</span>
                    <strong>{formatGrams(o.grams)}</strong>
                  </li>
                ))}
                <li className="outputs-list__item outputs-list__item--total">
                  <span>Total claimed output / Intake mass</span>
                  <strong>
                    {formatGrams(outputsTotal)} / {formatGrams(batch.intakeMassGrams)} (
                    {unrecoveredGrams} g unrecovered loss)
                  </strong>
                </li>
              </ul>
            </div>
          ) : null}
        </section>

        <div className="detail-split__side">
          <section className="card" aria-labelledby="review-title">
            <div className="card__header">
              <div>
                <h2 id="review-title">Verifier Review Checklist</h2>
                <p className="muted card__subtitle">
                  {awaitingReview
                    ? "This batch is in PROCESSED_CLAIMED with review status: Pending verifier review."
                    : `Current batch state is ${batch.state} (review status: ${review}).`}
                </p>
              </div>
            </div>
            <ReviewChecklist items={REVIEW_CHECKLIST} />
            <p className="muted checklist-disclaimer">
              Verification, return, and rejection can only be performed by the batch&apos;s
              assigned, independent verifier through the registry contract. This page has no such
              control and is not connected to the contract.
            </p>
          </section>

          <section className="card" aria-labelledby="timeline-title">
            <div className="card__header">
              <div>
                <h2 id="timeline-title">Event Timeline</h2>
                <p className="muted card__subtitle">
                  Chronological log distinguishing on-chain lifecycle transitions from derived
                  review-status updates.
                </p>
              </div>
              <span className="badge-pill">{batch.timeline.length} events</span>
            </div>
            <ol className="timeline">
              {batch.timeline.map((ev) => (
                <li key={ev.id} className={`timeline__item timeline__item--${ev.type}`}>
                  <div className="timeline__head">
                    <strong>{ev.title}</strong>
                    {ev.type === "review-status" ? (
                      <span className="tag">Review status</span>
                    ) : (
                      <span className="tag tag--transition">Lifecycle transition</span>
                    )}
                  </div>
                  <p>{ev.description}</p>
                  <p className="muted timeline__meta">
                    {ev.actor} · <time dateTime={ev.at}>{formatUtc(ev.at)}</time>
                  </p>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>
    </div>
  );
}
