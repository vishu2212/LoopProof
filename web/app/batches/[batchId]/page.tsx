import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
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
import { REASON_MEANING, reviewStatusFor } from "@/lib/lifecycle";

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

  return (
    <div className="page">
      <div className="detail-topbar">
        <nav aria-label="Breadcrumb" className="breadcrumb">
          <Link href="/">Dashboard</Link> <span aria-hidden="true">/</span>{" "}
          <span aria-current="page">{batch.id}</span>
        </nav>
        <nav aria-label="Switch demo batch" className="batch-switcher">
          <span className="batch-switcher__label">Batch:</span>
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
        <strong>DEMO</strong> Synthetic demo data · Prototype only. Backend and blockchain are not connected.
      </div>

      <header className="detail-header card">
        <div className="detail-header__main">
          <p className="eyebrow">Batch Custody &amp; Evidence Record (Synthetic)</p>
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
              {batch.intakeMassGrams > 0 ? formatGrams(batch.intakeMassGrams) : "Not collected"}
            </strong>
          </div>
          <div className="detail-stat">
            <span className="detail-stat__label">Claimed Output</span>
            <strong className="detail-stat__value">
              {batch.outputsGrams.length > 0 ? formatGrams(outputsTotal) : "No claim yet"}
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
                        <code>{e.hashPlaceholder}</code>
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
