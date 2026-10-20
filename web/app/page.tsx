import Link from "next/link";
import { StateBadge } from "@/components/StateBadge";
import { DEMO_BATCHES, DEMO_DATA_NOTICE } from "@/lib/demo-data";
import { formatGrams, formatUtc } from "@/lib/format";
import {
  ALTERNATIVE_OUTCOMES,
  CANONICAL_STAGES,
  REASON_MEANING,
  STATE_LABEL,
  STATE_MEANING,
  reviewStatusFor,
} from "@/lib/lifecycle";

export default function DashboardPage() {
  const countFor = (state: string) => DEMO_BATCHES.filter((b) => b.state === state).length;
  const totalBatches = DEMO_BATCHES.length;
  const inCustodyCount =
    countFor("REGISTERED") + countFor("COLLECTED") + countFor("RECEIVED");
  const pendingReview = DEMO_BATCHES.filter(
    (b) => reviewStatusFor(b.state) === "Pending verifier review",
  ).length;
  const verifiedCount = countFor("VERIFIED");
  const activeQueue = DEMO_BATCHES.filter(
    (b) => b.state === "PROCESSED_CLAIMED" || b.state === "RETURNED",
  );
  const completedReviews = DEMO_BATCHES.filter(
    (b) => b.state === "VERIFIED" || b.state === "REJECTED",
  );

  return (
    <div className="page">
      <section className="overview-hero">
        <h1>Traceability Overview</h1>
        <p className="lede">Track collection, processing evidence, and independently verified outcomes.</p>
        <p className="demo-inline"><strong>DEMO</strong> Synthetic demo data · prototype only</p>
        <p className="hero-note"><b>01</b> Collected does not mean recycled. This dashboard tracks evidence submission and independent verification, not physical processing completion.</p>
        <p className="hero-note"><b>02</b> Backend and blockchain are not connected in this prototype. All batch identifiers, evidence records, and verification states are synthetic demo content.</p>
      </section>

      <section aria-label="Summary metrics (synthetic demo data)" className="kpi-grid">
        <article className="kpi-card">
          <span className="kpi-card__label">Registered Batches</span>
          <strong className="kpi-card__value">{totalBatches}</strong>
          <span className="kpi-card__meta">Total synthetic demo records</span>
        </article>

        <article className="kpi-card kpi-card--progress">
          <span className="kpi-card__label">Awaiting Processing</span>
          <strong className="kpi-card__value">{inCustodyCount}</strong>
          <span className="kpi-card__meta">Registered, collected, or received</span>
        </article>

        <article className="kpi-card kpi-card--claim">
          <span className="kpi-card__label">Pending Verification</span>
          <strong className="kpi-card__value">{pendingReview}</strong>
          <span className="kpi-card__meta">Review status, not a lifecycle stage</span>
        </article>

        <article className="kpi-card kpi-card--ok">
          <span className="kpi-card__label">Verified Batches</span>
          <strong className="kpi-card__value">{verifiedCount}</strong>
          <span className="kpi-card__meta">Reached the VERIFIED stage</span>
        </article>
      </section>

      <section aria-labelledby="lifecycle-title" className="card">
        <div className="card__header">
          <div>
            <h2 id="lifecycle-title">Batch Lifecycle</h2>
            <p className="muted card__subtitle">Evidence is required at every transition. A processing claim is not a verified outcome.</p>
          </div>
          <span className="badge-pill">5 Canonical Stages · 3 Alternative Outcomes</span>
        </div>

        <ol className="lifecycle-counts" aria-label="Batches per lifecycle stage (demo data)">
          {CANONICAL_STAGES.map((stage, index) => (
            <li key={stage} className="lifecycle-stage-card">
              <div className="lifecycle-stage-card__top">
                <span className="lifecycle-stage-card__step">Stage {index + 1}</span>
                <span className="count">{countFor(stage)}</span>
              </div>
              <span className="count-label">{STATE_LABEL[stage]}</span>
              <code>{stage}</code>
              <span className="lifecycle-stage-card__meaning">{STATE_MEANING[stage]}</span>
            </li>
          ))}
        </ol>

        <div className="outcomes-panel">
          <div className="outcomes-panel__head">
            <h3>Alternative outcomes</h3>
            <span className="muted">
              Non-happy-path states separated from the five canonical progression stages
            </span>
          </div>
          <ul className="outcome-counts" aria-label="Batches per alternative outcome (demo data)">
            {ALTERNATIVE_OUTCOMES.map((o) => (
              <li key={o} className={`outcome-card outcome-card--${o.toLowerCase()}`}>
                <div className="outcome-card__top">
                  <span className="count-label">{STATE_LABEL[o]}</span>
                  <span className="count">{countFor(o)}</span>
                </div>
                <code>{o}</code>
                <span className="outcome-card__meaning">{STATE_MEANING[o]}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="review-note">
          <strong>Pending verifier review: {pendingReview}</strong> — a <em>review status</em> of
          batches in <code>PROCESSED_CLAIMED</code>, not a lifecycle stage.
        </p>
      </section>

      <div className="dashboard-split">
        <section aria-labelledby="batches-title" className="card dashboard-split__main">
          <div className="card__header">
            <div>
              <h2 id="batches-title">Recent Batches</h2>
              <p className="muted card__subtitle">
                Select any batch ID to inspect its custody summary, placeholder evidence hashes,
                verifier checklist, and event timeline.
              </p>
            </div>
            <span className="badge-pill">{DEMO_BATCHES.length} synthetic records</span>
          </div>

          <div className="table-wrap" role="region" aria-labelledby="batches-title" tabIndex={0}>
            <table>
              <caption className="visually-hidden">
                Demo batches with lifecycle state, review status and last update. Synthetic data.
              </caption>
              <thead>
                <tr>
                  <th scope="col">Batch</th>
                  <th scope="col">Category</th>
                  <th scope="col">Lifecycle state</th>
                  <th scope="col">Review status</th>
                  <th scope="col">Intake</th>
                  <th scope="col">Evidence</th>
                  <th scope="col">Last updated</th>
                </tr>
              </thead>
              <tbody>
                {DEMO_BATCHES.map((b) => {
                  const review = reviewStatusFor(b.state);
                  return (
                    <tr key={b.id}>
                      <th scope="row">
                        <Link href={`/batches/${b.id}`} className="batch-id-link">
                          {b.id}
                        </Link>
                      </th>
                      <td>{b.category}</td>
                      <td>
                        <StateBadge state={b.state} />
                      </td>
                      <td>
                        {review === "Not applicable" ? (
                          <span className="muted">—</span>
                        ) : (
                          <span
                            className={`review-pill ${
                              review === "Pending verifier review"
                                ? "review-pill--pending"
                                : review === "Awaiting resubmission"
                                  ? "review-pill--returned"
                                  : "review-pill--done"
                            }`}
                          >
                            {review}
                          </span>
                        )}
                      </td>
                      <td>{formatGrams(b.intakeMassGrams)}</td>
                      <td>
                        <span className="muted">{b.evidence.length} of 3 records</span>
                      </td>
                      <td>
                        <time dateTime={b.lastUpdated}>{formatUtc(b.lastUpdated)}</time>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="muted table-footnote">
            Environmental impact is unavailable unless a batch is <code>VERIFIED</code> with
            complete evidence and cited public factors; none are available in this demo, so no
            impact figures are shown.
          </p>
        </section>

        <section aria-labelledby="review-queue-title" className="card dashboard-split__side">
          <div className="card__header">
            <div>
              <h2 id="review-queue-title">Evidence Review Queue</h2>
              <p className="muted card__subtitle">
                Batches awaiting independent verifier action or processor resubmission (synthetic).
              </p>
            </div>
          </div>

          <div className="queue-group">
            <h3 className="queue-group__title">Action required ({activeQueue.length})</h3>
            <ul className="queue-list" aria-label="Batches requiring verifier or processor action">
              {activeQueue.map((b) => {
                const review = reviewStatusFor(b.state);
                const claimedTotal = b.outputsGrams.reduce((sum, o) => sum + o.grams, 0);
                return (
                  <li key={b.id} className="queue-item">
                    <div className="queue-item__top">
                      <Link href={`/batches/${b.id}`} className="batch-id-link">
                        {b.id}
                      </Link>
                      <StateBadge state={b.state} />
                    </div>
                    <p className="queue-item__category">{b.category}</p>
                    <dl className="queue-item__meta">
                      <div>
                        <dt>Review status</dt>
                        <dd>{review}</dd>
                      </div>
                      <div>
                        <dt>Assigned verifier</dt>
                        <dd>{b.verifier}</dd>
                      </div>
                      <div>
                        <dt>Mass balance</dt>
                        <dd>
                          {formatGrams(claimedTotal)} claimed / {formatGrams(b.intakeMassGrams)}{" "}
                          intake
                        </dd>
                      </div>
                      <div>
                        <dt>Evidence</dt>
                        <dd>{b.evidence.length} placeholder hashes</dd>
                      </div>
                    </dl>
                    {b.outcome ? (
                      <p className="queue-item__reason">
                        <code>{b.outcome.reason}</code> — {REASON_MEANING[b.outcome.reason]}
                      </p>
                    ) : null}
                    <div className="queue-item__actions">
                      <Link href={`/batches/${b.id}`} className="queue-link">
                        Open evidence &amp; review checklist →
                      </Link>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="queue-group">
            <h3 className="queue-group__title">Recent verifier decisions ({completedReviews.length})</h3>
            <ul className="queue-list" aria-label="Completed verifier reviews">
              {completedReviews.map((b) => (
                <li key={b.id} className="queue-item queue-item--compact">
                  <div className="queue-item__top">
                    <Link href={`/batches/${b.id}`} className="batch-id-link">
                      {b.id}
                    </Link>
                    <StateBadge state={b.state} />
                  </div>
                  <p className="queue-item__category">
                    {b.category} · {reviewStatusFor(b.state)}
                  </p>
                  {b.outcome ? (
                    <p className="queue-item__reason">
                      <code>{b.outcome.reason}</code> — {REASON_MEANING[b.outcome.reason]}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        </section>
      </div>
    </div>
  );
}
