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

  const totalIntakeMassGrams = DEMO_BATCHES.reduce((sum, b) => sum + b.intakeMassGrams, 0);

  const inTransitBatches = DEMO_BATCHES.filter(
    (b) => b.state === "REGISTERED" || b.state === "COLLECTED" || b.state === "RECEIVED",
  );
  const inTransitMassGrams = inTransitBatches.reduce((sum, b) => sum + b.intakeMassGrams, 0);

  const pendingReviewBatches = DEMO_BATCHES.filter(
    (b) => reviewStatusFor(b.state) === "Pending verifier review",
  );
  const pendingReviewMassGrams = pendingReviewBatches.reduce((sum, b) => sum + b.intakeMassGrams, 0);

  const verifiedBatches = DEMO_BATCHES.filter((b) => b.state === "VERIFIED");
  const verifiedMassGrams = verifiedBatches.reduce((sum, b) => sum + b.intakeMassGrams, 0);

  const formatKg = (grams: number) =>
    grams > 0
      ? `${(grams / 1000).toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kg`
      : "0.0 kg";

  // Batches requiring verifier attention, returned for evidence, or rejected
  const blockedReviewBatches = DEMO_BATCHES.filter(
    (b) =>
      b.state === "REJECTED" ||
      b.state === "RETURNED" ||
      reviewStatusFor(b.state) === "Pending verifier review",
  );

  // Recent custody timeline events compiled dynamically from demo fixtures
  const recentCustodyEvents = DEMO_BATCHES.flatMap((b) =>
    b.timeline.map((ev) => ({
      ...ev,
      batchId: b.id,
      category: b.category,
      batchState: b.state,
    })),
  )
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .slice(0, 4);

  return (
    <div className="page">
      {/* FLORA Editorial Hero Header */}
      <header className="overview-hero">
        <div className="overview-hero__top">
          <div>
            <h1>Material Traceability</h1>
            <span className="overview-hero__subtitle">Evidence Ledger · Circular Industry</span>
          </div>
          <div className="overview-hero__pills">
            <span className="pill-archival">
              <span className="pill-archival__dot" aria-hidden="true" />
              Audited Ledger · Gated Claims
            </span>
            <span className="pill-synthetic">
              Synthetic Demo Environment
            </span>
          </div>
        </div>

        <p className="lede">
          <strong>“Collected does not mean recycled.”</strong> Environmental impact claims remain
          strictly gated until physical custody evidence and mass balance are independently verified.
        </p>

        <div className="hero-audit-strip">
          <span className="hero-audit-item">
            <strong>{totalBatches}</strong> demo lots under custody
          </span>
          <span className="hero-audit-sep">/</span>
          <span className="hero-audit-item">
            <strong>{pendingReviewBatches.length}</strong> awaiting independent audit
          </span>
          <span className="hero-audit-sep">/</span>
          <span className="hero-audit-item">
            <strong>{verifiedBatches.length}</strong> independently verified
          </span>
          <span className="hero-audit-sep">/</span>
          <span className="hero-audit-item hero-audit-item--alert">
            <strong>0 kg</strong> unverified impact credited
          </span>
        </div>
      </header>

      {/* Summary KPI Cards (Exactly 4 elements with className="kpi-card") */}
      <section aria-label="Summary metrics (synthetic demo data)" className="kpi-grid">
        <article className="kpi-card">
          <span className="kpi-card__label">Total Registered Mass</span>
          <strong className="kpi-card__value">{formatKg(totalIntakeMassGrams)}</strong>
          <span className="kpi-card__meta">
            {formatGrams(totalIntakeMassGrams)} · {totalBatches} lots tracked
          </span>
        </article>

        <article className="kpi-card kpi-card--progress">
          <span className="kpi-card__label">In Transit / Received</span>
          <strong className="kpi-card__value">{formatKg(inTransitMassGrams)}</strong>
          <span className="kpi-card__meta">
            {formatGrams(inTransitMassGrams)} · {inTransitBatches.length} lots at intake docks
          </span>
        </article>

        <article className="kpi-card kpi-card--claim">
          <span className="kpi-card__label">Claims Pending Review</span>
          <strong className="kpi-card__value">{formatKg(pendingReviewMassGrams)}</strong>
          <span className="kpi-card__meta">
            {formatGrams(pendingReviewMassGrams)} · {pendingReviewBatches.length} claim awaiting verifier
          </span>
        </article>

        <article className="kpi-card kpi-card--ok">
          <span className="kpi-card__label">Independently Verified</span>
          <strong className="kpi-card__value">{formatKg(verifiedMassGrams)}</strong>
          <span className="kpi-card__meta">
            {formatGrams(verifiedMassGrams)} · {verifiedBatches.length} batch verified &amp; anchored
          </span>
        </article>
      </section>

      {/* 5-Stage Lifecycle Rail */}
      <section aria-labelledby="lifecycle-title" className="card lifecycle-section">
        <div className="card__header">
          <div>
            <h2 id="lifecycle-title">Custody &amp; Verification Pipeline</h2>
            <p className="muted card__subtitle">
              Every transition requires specific physical evidence. Stages 01–03 track physical custody; Stage
              04 is a self-reported claim; Stage 05 is an audited outcome.
            </p>
          </div>
          <span className="badge-pill">5 Canonical Stages · 3 Alternative Outcomes</span>
        </div>

        {/* Horizontal Connected Rail */}
        <div className="lifecycle-rail" aria-label="5-stage lifecycle rail">
          {CANONICAL_STAGES.map((stage, index) => {
            const nature =
              stage === "PROCESSED_CLAIMED"
                ? "Claim"
                : stage === "VERIFIED"
                  ? "Audit"
                  : "Custody";
            return (
              <div key={stage} className="lifecycle-rail__node">
                <span className="lifecycle-rail__nature">{nature}</span>
                <span className="lifecycle-rail__dot" aria-hidden="true">
                  0{index + 1}
                </span>
                <span className="lifecycle-rail__label">{STATE_LABEL[stage]}</span>
                <code>{stage}</code>
                <span className="lifecycle-rail__count">
                  {countFor(stage)} {countFor(stage) === 1 ? "batch" : "batches"}
                </span>
              </div>
            );
          })}
        </div>

        <div className="outcomes-panel">
          <div className="outcomes-panel__head">
            <h3>Alternative Lifecycle Outcomes</h3>
            <span className="muted">
              Non-linear state paths: returns require evidence rectification; rejection is terminal
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
          <strong>Review Status Disambiguation:</strong> <em>Pending verifier review</em> (
          {pendingReviewBatches.length} batch) is a derived status of batches in <code>PROCESSED_CLAIMED</code>, not a
          distinct lifecycle stage.
        </p>
      </section>

      {/* Main Content Split: Batch Ledger & Side Feeds */}
      <div className="dashboard-split">
        {/* Left: Batch Ledger Table */}
        <section aria-labelledby="batches-title" className="card dashboard-split__main">
          <div className="card__header">
            <div>
              <h2 id="batches-title">Batch Ledger</h2>
              <p className="muted card__subtitle">
                Inspect physical intake weight, claimed output fractions, cryptographic evidence hashes,
                and verifier audit checklists.
              </p>
            </div>
            <span className="table-filter-tag">Synthetic Demo Record ⌄</span>
          </div>

          <div className="table-wrap" role="region" aria-labelledby="batches-title" tabIndex={0}>
            <table className="batch-ledger-table">
              <caption className="visually-hidden">
                Demo batches with lifecycle state, review status and last update. Synthetic data.
              </caption>
              <thead>
                <tr>
                  <th scope="col">Batch ID</th>
                  <th scope="col">Material Category</th>
                  <th scope="col" className="cell--right">Mass (kg)</th>
                  <th scope="col">Lifecycle Stage</th>
                  <th scope="col">Evidence Status</th>
                  <th scope="col">Updated (UTC)</th>
                </tr>
              </thead>
              <tbody>
                {DEMO_BATCHES.map((b) => {
                  const review = reviewStatusFor(b.state);
                  const isVerified = b.state === "VERIFIED";
                  const isPending = review === "Pending verifier review";
                  const isFlagged = b.state === "RETURNED" || b.state === "REJECTED";

                  return (
                    <tr key={b.id}>
                      <th scope="row">
                        <Link href={`/batches/${b.id}`} className="batch-id-link">
                          {b.id}
                        </Link>
                      </th>
                      <td>{b.category}</td>
                      <td className="cell--mono cell--right">{formatKg(b.intakeMassGrams)}</td>
                      <td>
                        <StateBadge state={b.state} />
                      </td>
                      <td>
                        <div className="table-evidence-cell">
                          {isVerified ? (
                            <span className="status-pill status-pill--verified">Audit Verified</span>
                          ) : isPending ? (
                            <span className="status-pill status-pill--pending">Docs Pending</span>
                          ) : isFlagged ? (
                            <span className="status-pill status-pill--flagged">Flagged</span>
                          ) : (
                            <span className="status-pill status-pill--neutral">Custody Tracked</span>
                          )}
                          <span
                            className="evidence-count-tag"
                            title={`${b.evidence.length} of 3 stage records anchored`}
                          >
                            {b.evidence.length}/3
                          </span>
                        </div>
                      </td>
                      <td className="cell--mono">
                        <time dateTime={b.lastUpdated}>{formatUtc(b.lastUpdated)}</time>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p className="muted table-footnote">
            <strong>Impact Gate (D-08):</strong> Environmental impact credits remain strictly
            unavailable until a batch is <code>VERIFIED</code> with complete evidence and cited public
            factors. No impact figures are estimated or shown.
          </p>
        </section>

        {/* Right: Unreconciled Claims Queue & Custody Events */}
        <div className="dashboard-split__side">
          {/* Top: Unreconciled Claims Queue */}
          <section aria-labelledby="review-queue-title" className="card">
            <div className="card__header">
              <div>
                <h2 id="review-queue-title">Unreconciled Claims Queue</h2>
                <p className="muted card__subtitle">
                  Batches requiring verifier audit or processor rectification.
                </p>
              </div>
            </div>

            <div className="unreconciled-queue">
              {blockedReviewBatches.map((b) => {
                const isRejected = b.state === "REJECTED";
                const isReturned = b.state === "RETURNED";
                const themeClass = isRejected
                  ? "unreconciled-card--oxide"
                  : "unreconciled-card--ochre";

                return (
                  <Link
                    key={b.id}
                    href={`/batches/${b.id}`}
                    className={`unreconciled-card ${themeClass}`}
                  >
                    <span className="unreconciled-card__icon" aria-hidden="true">
                      {isRejected ? (
                        <svg
                          width="18"
                          height="18"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <circle cx="12" cy="12" r="10" />
                          <line x1="4.93" x2="19.07" y1="4.93" y2="19.07" />
                        </svg>
                      ) : (
                        <svg
                          width="18"
                          height="18"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                          <line x1="12" x2="12" y1="9" y2="13" />
                          <line x1="12" x2="12.01" y1="17" y2="17" />
                        </svg>
                      )}
                    </span>
                    <div className="unreconciled-card__content">
                      <div className="unreconciled-card__title-row">
                        <span className="unreconciled-card__title">
                          {isRejected
                            ? "Blocked Verification · Rejected"
                            : isReturned
                              ? "Blocked Verification · Returned"
                              : "Blocked Verification · Pending Review"}
                        </span>
                        <span className="unreconciled-card__batch">{b.id}</span>
                      </div>
                      <p className="unreconciled-card__reason">
                        {b.outcome ? (
                          <>
                            <strong>{b.outcome.reason}:</strong> {REASON_MEANING[b.outcome.reason]}
                          </>
                        ) : (
                          "Awaiting independent verifier attestation and evidence review."
                        )}
                      </p>
                      <div className="unreconciled-card__action">
                        <span>Inspect audit record</span>
                        <span aria-hidden="true">→</span>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>

          {/* Bottom: Recent Custody Events Audit Feed */}
          <section aria-labelledby="custody-events-title" className="card">
            <div className="card__header">
              <div>
                <h2 id="custody-events-title">Recent Custody Events</h2>
                <p className="muted card__subtitle">
                  Chronological chain-of-custody transfer log.
                </p>
              </div>
            </div>

            <ol className="custody-feed">
              {recentCustodyEvents.map((ev) => {
                const isVerified = ev.batchState === "VERIFIED";
                const isWarn = ev.batchState === "RETURNED" || ev.batchState === "PROCESSED_CLAIMED";
                const isAlert = ev.batchState === "REJECTED";
                const dotClass = isVerified
                  ? "custody-feed__dot--verified"
                  : isAlert
                    ? "custody-feed__dot--alert"
                    : isWarn
                      ? "custody-feed__dot--warn"
                      : "";

                return (
                  <li key={ev.id} className="custody-feed__item">
                    <span className={`custody-feed__dot ${dotClass}`} aria-hidden="true" />
                    <div className="custody-feed__head">
                      <span className="custody-feed__title">
                        <Link href={`/batches/${ev.batchId}`} className="batch-id-link">
                          {ev.batchId}
                        </Link>{" "}
                        · {ev.title}
                      </span>
                      <time dateTime={ev.at} className="custody-feed__time">
                        {formatUtc(ev.at)}
                      </time>
                    </div>
                    <p className="custody-feed__desc">{ev.description}</p>
                    <p className="custody-feed__actor">{ev.actor}</p>
                  </li>
                );
              })}
            </ol>
          </section>
        </div>
      </div>
    </div>
  );
}
