import type { Metadata } from "next";
import Link from "next/link";
import { LifecycleStepper } from "@/components/LifecycleStepper";
import { LiveLifecycleActions } from "@/components/LiveLifecycleActions";
import { StateBadge } from "@/components/StateBadge";
import { UserSessionBanner } from "@/components/UserSessionBanner";
import { categoryLabel, materialLabel } from "@/lib/categories";
import { formatGrams, formatUtc } from "@/lib/format";
import { REASON_MEANING, reviewStatusFor } from "@/lib/lifecycle";
import {
  LIVE_BATCH_SELECT_COLUMNS,
  LIVE_VERIFIER_CHECKLIST,
  formatByteaHex,
  getCurrentUserWithRoles,
  isPublicBatchRef,
  isValidUuid,
  type LiveBatchRow,
  type LiveDecisionRow,
  type LiveEventRow,
  type LiveEvidenceRow,
  type LiveOutputRow,
} from "@/lib/live-batches";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

type Params = { batchId: string };

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { batchId } = await params;
  return { title: `Live Batch ${batchId}` };
}

export default async function LiveBatchDetailPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { batchId } = await params;
  const trimmedId = batchId.trim();

  let supabase;
  try {
    supabase = await createSupabaseServerClient();
  } catch (err) {
    return (
      <div className="page">
        <h1>Live Batch Detail — Configuration Error</h1>
        <div className="form-alert form-alert--error" role="alert">
          {err instanceof Error ? err.message : "Missing Supabase configuration."}
        </div>
      </div>
    );
  }

  const sessionState = await getCurrentUserWithRoles(supabase);
  const { user, roles } = sessionState;

  if (!user) {
    return (
      <div className="page">
        <nav aria-label="Breadcrumb" className="breadcrumb">
          <Link href="/live-batches">Live Registry</Link> <span aria-hidden="true">/</span>{" "}
          <span aria-current="page">{trimmedId}</span>
        </nav>
        <h1>Sign-in required</h1>
        <UserSessionBanner user={null} roles={[]} />
        <section className="card">
          <p className="muted">
            You must be signed in as an assigned participant on this batch to view its live
            custody record and evidence history.
          </p>
          <p>
            <Link href="/login" className="btn btn--primary">
              Go to Sign In →
            </Link>
          </p>
        </section>
      </div>
    );
  }

  const lookupCol = isPublicBatchRef(trimmedId)
    ? "public_ref"
    : isValidUuid(trimmedId)
      ? "id"
      : null;

  if (!lookupCol) {
    return (
      <div className="page">
        <nav aria-label="Breadcrumb" className="breadcrumb">
          <Link href="/live-batches">Live Registry</Link> <span aria-hidden="true">/</span>{" "}
          <span aria-current="page">{trimmedId}</span>
        </nav>
        <UserSessionBanner user={user} roles={roles} roleError={sessionState.roleError} />
        <section className="card" role="alert">
          <h1>Invalid Live Batch Identifier</h1>
          <p className="muted">
            <code>{trimmedId}</code> is neither a valid batch UUID nor a <code>LP-xxxxxx</code>{" "}
            public reference.
          </p>
          <p>
            <Link href="/live-batches" className="btn">
              ← Back to Live Batch Registry
            </Link>
          </p>
        </section>
      </div>
    );
  }

  const { data: batchData, error: batchError } = await supabase
    .from("batches")
    .select(LIVE_BATCH_SELECT_COLUMNS)
    .eq(lookupCol, trimmedId)
    .maybeSingle();

  const batch = (batchData ?? null) as LiveBatchRow | null;

  if (batchError || !batch) {
    return (
      <div className="page">
        <nav aria-label="Breadcrumb" className="breadcrumb">
          <Link href="/live-batches">Live Registry</Link> <span aria-hidden="true">/</span>{" "}
          <span aria-current="page">{trimmedId}</span>
        </nav>
        <UserSessionBanner user={user} roles={roles} roleError={sessionState.roleError} />
        <section className="card" role="alert">
          <h1>Live Batch Not Found or Access Denied by RLS</h1>
          <p className="muted">
            {batchError
              ? `[${batchError.code ?? "ERROR"}] ${batchError.message}`
              : `No batch matching "${trimmedId}" is visible to your account (${user.id}). Under Row Level Security (batches_select_participant), only the assigned registrar, collector, processor, or verifier may read a batch.`}
          </p>
          <p>
            <Link href="/live-batches" className="btn">
              ← Back to Live Batch Registry
            </Link>
          </p>
        </section>
      </div>
    );
  }

  const [evRes, evtRes, outRes, decRes] = await Promise.all([
    supabase
      .from("evidence")
      .select(
        "id, batch_id, kind, revision, sha256, storage_bucket, storage_path, byte_size, mime_type, submitted_by, created_at",
      )
      .eq("batch_id", batch.id)
      .order("created_at", { ascending: true }),
    supabase
      .from("batch_events")
      .select(
        "id, batch_id, seq, from_state, to_state, actor_id, evidence_id, revision, return_reason, reject_reason, created_at",
      )
      .eq("batch_id", batch.id)
      .order("seq", { ascending: true }),
    supabase
      .from("processing_outputs")
      .select("batch_id, revision, position, material_code, mass_grams")
      .eq("batch_id", batch.id)
      .eq("revision", batch.current_revision)
      .order("position", { ascending: true }),
    supabase
      .from("verifier_decisions")
      .select(
        "id, batch_id, revision, decision, return_reason, reject_reason, checklist, verifier_id, created_at",
      )
      .eq("batch_id", batch.id)
      .order("revision", { ascending: false }),
  ]);

  const evidence = (evRes.data ?? []) as unknown as LiveEvidenceRow[];
  const events = (evtRes.data ?? []) as unknown as LiveEventRow[];
  const currentOutputs = (outRes.data ?? []) as unknown as LiveOutputRow[];
  const decisions = (decRes.data ?? []) as unknown as LiveDecisionRow[];
  const latestDecision = decisions[0];

  const review = reviewStatusFor(batch.state);
  const outputsTotal = currentOutputs.reduce((sum, o) => sum + Number(o.mass_grams), 0);

  return (
    <div className="page">
      <div className="detail-topbar">
        <nav aria-label="Breadcrumb" className="breadcrumb">
          <Link href="/live-batches">Live Registry</Link> <span aria-hidden="true">/</span>{" "}
          <span aria-current="page">{batch.public_ref}</span>
        </nav>
        <Link href="/live-batches" className="btn">
          ← All Live Batches
        </Link>
      </div>

      <UserSessionBanner user={user} roles={roles} roleError={sessionState.roleError} />

      <header className="detail-header card">
        <div className="detail-header__main">
          <p className="eyebrow">Live Supabase Record · RLS-Protected</p>
          <div className="detail-header__title-row">
            <h1>Batch {batch.public_ref}</h1>
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
          <p className="detail-header__category">{categoryLabel(batch.category_code)}</p>
          <p className="lede">
            Batch UUID: <code>{batch.id}</code> · Created{" "}
            <time dateTime={batch.created_at}>{formatUtc(batch.created_at)}</time>
          </p>
        </div>

        <div className="detail-header__meta">
          <div className="detail-stat">
            <span className="detail-stat__label">Recorded Intake</span>
            <strong className="detail-stat__value">
              {batch.intake_mass_grams && batch.intake_mass_grams > 0
                ? formatGrams(batch.intake_mass_grams)
                : "Not collected"}
            </strong>
          </div>
          <div className="detail-stat">
            <span className="detail-stat__label">Claimed Output</span>
            <strong className="detail-stat__value">
              {currentOutputs.length > 0 ? formatGrams(outputsTotal) : "No claim yet"}
            </strong>
          </div>
          <div className="detail-stat">
            <span className="detail-stat__label">Revision</span>
            <strong className="detail-stat__value">#{batch.current_revision}</strong>
          </div>
        </div>
      </header>

      {latestDecision && (latestDecision.return_reason || latestDecision.reject_reason) ? (
        <section
          className={`card outcome outcome--${
            latestDecision.decision === "returned" ? "returned" : "rejected"
          }`}
          aria-labelledby="live-outcome-title"
        >
          <div className="card__header">
            <h2 id="live-outcome-title">
              {latestDecision.decision === "returned"
                ? "Verifier Return Reason"
                : "Verifier Rejection Reason"}
            </h2>
            <span className="badge-pill">Revision #{latestDecision.revision}</span>
          </div>
          {latestDecision.return_reason ? (
            <p className="outcome__reason">
              <code>{latestDecision.return_reason}</code> —{" "}
              {REASON_MEANING[latestDecision.return_reason]}
            </p>
          ) : null}
          {latestDecision.reject_reason ? (
            <p className="outcome__reason">
              <code>{latestDecision.reject_reason}</code> —{" "}
              {REASON_MEANING[latestDecision.reject_reason]}
            </p>
          ) : null}
          <p className="muted">
            Recorded by verifier <code>{latestDecision.verifier_id}</code> at{" "}
            <time dateTime={latestDecision.created_at}>{formatUtc(latestDecision.created_at)}</time>
          </p>
        </section>
      ) : null}

      <section className="card" aria-labelledby="live-summary-title">
        <div className="card__header">
          <div>
            <h2 id="live-summary-title">Custody Assignments &amp; Impact Gate</h2>
            <p className="muted card__subtitle">
              All four assigned account UUIDs are locked at registration (D-15). The verifier is
              enforced to be distinct from collector and processor.
            </p>
          </div>
        </div>
        <dl className="summary-grid">
          <div className="summary-cell">
            <dt>Registrar UUID</dt>
            <dd>
              <code>{batch.registrar_id}</code>
            </dd>
          </div>
          <div className="summary-cell">
            <dt>Collector UUID</dt>
            <dd>
              <code>{batch.collector_id}</code>
            </dd>
          </div>
          <div className="summary-cell">
            <dt>Processor UUID (locked)</dt>
            <dd>
              <code>{batch.processor_id}</code>
            </dd>
          </div>
          <div className="summary-cell">
            <dt>Independent Verifier UUID</dt>
            <dd>
              <code>{batch.verifier_id}</code>
            </dd>
          </div>
          <div className="summary-cell">
            <dt>Claim key exposure</dt>
            <dd>Hidden (32-byte commitment omitted from SELECT)</dd>
          </div>
          <div className="summary-cell">
            <dt>Environmental impact</dt>
            <dd>Unavailable (no cited public factors)</dd>
          </div>
        </dl>
        <div className="impact-callout" role="note">
          <strong>Impact gate (D-08):</strong> Environmental impact must not be claimed until the
          batch reaches <code>VERIFIED</code> with complete evidence and cited public factors. No
          impact figures are stored or estimated.
        </div>
      </section>

      <section className="card" aria-labelledby="live-lifecycle-title">
        <div className="card__header">
          <h2 id="live-lifecycle-title">Canonical Lifecycle &amp; Alternative Outcomes</h2>
        </div>
        <LifecycleStepper current={batch.state} />
      </section>

      <LiveLifecycleActions batch={batch} currentUser={user} roles={roles} />

      <div className="detail-split">
        <section className="card detail-split__main" aria-labelledby="live-evidence-title">
          <div className="card__header">
            <div>
              <h2 id="live-evidence-title">Evidence Metadata &amp; SHA-256 Digests</h2>
              <p className="muted card__subtitle">
                Files stay in the private Storage bucket <code>evidence</code>. Only metadata and
                32-byte SHA-256 hashes are stored in <code>public.evidence</code>.
              </p>
            </div>
            <span className="badge-pill">{evidence.length} records</span>
          </div>

          {evidence.length === 0 ? (
            <p className="empty-state">
              No evidence records have been submitted for this batch yet (currently{" "}
              <code>{batch.state}</code>).
            </p>
          ) : (
            <div
              className="table-wrap"
              role="region"
              aria-labelledby="live-evidence-title"
              tabIndex={0}
            >
              <table>
                <caption className="visually-hidden">
                  Live evidence records for batch {batch.public_ref}
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Kind</th>
                    <th scope="col">Submitted by</th>
                    <th scope="col">SHA-256</th>
                    <th scope="col">Storage path</th>
                    <th scope="col">Created (UTC)</th>
                  </tr>
                </thead>
                <tbody>
                  {evidence.map((e) => (
                    <tr key={e.id}>
                      <th scope="row">
                        {e.kind}
                        {e.revision ? (
                          <span className="muted block">Revision #{e.revision}</span>
                        ) : null}
                      </th>
                      <td>
                        <code>{e.submitted_by}</code>
                      </td>
                      <td>
                        <code>{formatByteaHex(e.sha256)}</code>
                      </td>
                      <td>
                        <code>{e.storage_path}</code>
                      </td>
                      <td>
                        <time dateTime={e.created_at}>{formatUtc(e.created_at)}</time>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {currentOutputs.length > 0 ? (
            <div className="outputs-subpanel" aria-labelledby="live-outputs-title">
              <h3 id="live-outputs-title">
                Claimed Processing Outputs — Revision #{batch.current_revision} (Mass-Balance Check)
              </h3>
              <p className="muted">
                Recorded in <code>public.processing_outputs</code>.{" "}
                {batch.state === "VERIFIED"
                  ? "The assigned independent verifier accepted this claim; that records the verifier's attestation, not physical proof of recycling."
                  : "A processor claim awaiting or subject to independent verifier review."}
              </p>
              <ul className="outputs-list">
                {currentOutputs.map((o) => (
                  <li key={`${o.revision}-${o.position}`} className="outputs-list__item">
                    <span>
                      #{o.position}: {materialLabel(o.material_code)}
                    </span>
                    <strong>{formatGrams(Number(o.mass_grams))}</strong>
                  </li>
                ))}
                <li className="outputs-list__item outputs-list__item--total">
                  <span>Total claimed output / Recorded intake mass</span>
                  <strong>
                    {formatGrams(outputsTotal)} /{" "}
                    {batch.intake_mass_grams ? formatGrams(batch.intake_mass_grams) : "—"} (
                    {batch.intake_mass_grams
                      ? `${Math.max(0, batch.intake_mass_grams - outputsTotal)} g unrecovered loss`
                      : "—"}
                    )
                  </strong>
                </li>
              </ul>
            </div>
          ) : null}
        </section>

        <div className="detail-split__side">
          {decisions.length > 0 ? (
            <section className="card" aria-labelledby="live-decisions-title">
              <div className="card__header">
                <div>
                  <h2 id="live-decisions-title">Recorded Verifier Decisions</h2>
                  <p className="muted card__subtitle">
                    From <code>public.verifier_decisions</code> (append-only).
                  </p>
                </div>
                <span className="badge-pill">{decisions.length} reviewed</span>
              </div>
              <div className="decisions-history">
                {decisions.map((d) => (
                  <div key={d.id} className="decision-record">
                    <div className="timeline__head">
                      <strong>
                        Revision #{d.revision}: {d.decision.toUpperCase()}
                      </strong>
                      <span className="badge-pill">
                        <time dateTime={d.created_at}>{formatUtc(d.created_at)}</time>
                      </span>
                    </div>
                    {d.return_reason ? (
                      <p>
                        Return reason: <code>{d.return_reason}</code> —{" "}
                        {REASON_MEANING[d.return_reason]}
                      </p>
                    ) : null}
                    {d.reject_reason ? (
                      <p>
                        Reject reason: <code>{d.reject_reason}</code> —{" "}
                        {REASON_MEANING[d.reject_reason]}
                      </p>
                    ) : null}
                    <ul className="decision-checklist-summary">
                      {LIVE_VERIFIER_CHECKLIST.map((item) => {
                        const val = d.checklist?.[item.key];
                        return (
                          <li key={item.key}>
                            <code>{val ? "✓" : "✗"}</code> {item.label}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          <section className="card" aria-labelledby="live-timeline-title">
            <div className="card__header">
              <div>
                <h2 id="live-timeline-title">Append-Only Event History</h2>
                <p className="muted card__subtitle">
                  From <code>public.batch_events</code> (protected by{" "}
                  <code>events_append_only</code> trigger).
                </p>
              </div>
              <span className="badge-pill">{events.length} events</span>
            </div>

            {events.length === 0 ? (
              <p className="empty-state">No lifecycle events found.</p>
            ) : (
              <ol className="timeline">
                {events.map((ev) => (
                  <li key={ev.id} className="timeline__item timeline__item--transition">
                    <div className="timeline__head">
                      <strong>
                        #{ev.seq}: {ev.from_state ?? "NONE"} → {ev.to_state}
                      </strong>
                      <span className="tag tag--transition">Lifecycle transition</span>
                    </div>
                    {ev.return_reason ? (
                      <p>
                        Return reason: <code>{ev.return_reason}</code>
                      </p>
                    ) : null}
                    {ev.reject_reason ? (
                      <p>
                        Reject reason: <code>{ev.reject_reason}</code>
                      </p>
                    ) : null}
                    <p className="muted timeline__meta">
                      Actor <code>{ev.actor_id}</code> ·{" "}
                      <time dateTime={ev.created_at}>{formatUtc(ev.created_at)}</time>
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
