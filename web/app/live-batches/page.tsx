import type { Metadata } from "next";
import Link from "next/link";
import { RegisterBatchForm } from "@/components/RegisterBatchForm";
import { StateBadge } from "@/components/StateBadge";
import { UserSessionBanner } from "@/components/UserSessionBanner";
import { categoryLabel } from "@/lib/categories";
import { formatGrams, formatUtc } from "@/lib/format";
import { reviewStatusFor } from "@/lib/lifecycle";
import {
  LIVE_BATCH_SELECT_COLUMNS,
  formatShortUuid,
  getCurrentUserWithRoles,
  type LiveBatchRow,
} from "@/lib/live-batches";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getSupabaseEnv } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Live Batch Registry (Supabase)",
};

export default async function LiveBatchesPage() {
  let supabase;
  let supabaseProject = "configured project";
  try {
    supabase = await createSupabaseServerClient();
    try {
      const { url } = getSupabaseEnv();
      const hostname = new URL(url).hostname;
      const refMatch = hostname.match(/^([a-z0-9_-]+)\.supabase\.co$/i);
      supabaseProject = refMatch ? refMatch[1] : hostname;
    } catch {
      // Keep fallback
    }
  } catch (err) {
    return (
      <div className="page">
        <h1>Live Batch Registry — Configuration Error</h1>
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
        <header className="page-header">
          <h1>Live Batch Registry</h1>
          <p className="lede">
            Live database records in Supabase are protected by Row Level Security. Anonymous access
            is revoked on all tables and lifecycle RPCs.
          </p>
        </header>

        <UserSessionBanner user={null} roles={[]} />

        <section className="card" role="note">
          <h2>Sign-in required to view or register live batches</h2>
          <p className="muted">
            {sessionState.authError?.toLowerCase().includes("refresh token") ||
            sessionState.authError?.toLowerCase().includes("jwt") ||
            sessionState.authError?.toLowerCase().includes("expired")
              ? "Your previous session has expired or is no longer valid. Sign in with your Supabase credentials to access RLS-scoped batch records."
              : (sessionState.authError ??
                "No authenticated Supabase session reached the server. Sign in to view batches where your account is an assigned participant or to register a batch.")}
          </p>
          <p>
            <Link href="/login" className="btn btn--primary">
              Go to Sign In →
            </Link>{" "}
            <Link href="/" className="btn">
              Back to Synthetic Demo Dashboard
            </Link>
          </p>
        </section>
      </div>
    );
  }

  const { data, error } = await supabase
    .from("batches")
    .select(LIVE_BATCH_SELECT_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(100);

  const batches = (data ?? []) as unknown as LiveBatchRow[];

  const assignmentsForUser = (b: LiveBatchRow, uid: string): string[] => {
    const out: string[] = [];
    if (b.registrar_id === uid) out.push("Registrar");
    if (b.collector_id === uid) out.push("Collector");
    if (b.processor_id === uid) out.push("Processor");
    if (b.verifier_id === uid) out.push("Verifier");
    return out;
  };

  return (
    <div className="page">
      <header className="page-header">
        <h1>Live Batch Registry</h1>
        <p className="lede">
          Connected to Supabase project <code>{supabaseProject}</code>. Only batches where your
          authenticated account is an assigned participant are returned by Row Level Security.
          Synthetic demo records are never shown here.
        </p>
      </header>

      <UserSessionBanner
        user={user}
        roles={roles}
        roleError={sessionState.roleError}
      />

      <RegisterBatchForm currentUserId={user.id} roles={roles} />

      <section className="card" aria-labelledby="live-batches-title">
        <div className="card__header">
          <div>
            <h2 id="live-batches-title">Your Assigned Live Batches</h2>
            <p className="muted card__subtitle">
              Scoped by <code>batches_select_participant</code> RLS policy (
              <code>auth.uid()</code> in registrar, collector, processor, or verifier).
            </p>
          </div>
          <span className="badge-pill">{batches.length} visible records</span>
        </div>

        {error ? (
          <div className="form-alert form-alert--error" role="alert">
            <strong>Unable to query live batches:</strong> [{error.code ?? "ERROR"}]{" "}
            {error.message}
          </div>
        ) : batches.length === 0 ? (
          <div className="empty-state" role="status">
            <p>
              <strong>No live batches visible for your account yet.</strong>
            </p>
            <p className="muted">
              Either no batches have been registered in Supabase yet, or your account (
              <code>{user.id}</code>) is not assigned as registrar, collector, processor, or
              verifier on any existing batch.
            </p>
          </div>
        ) : (
          <div
            className="table-wrap"
            role="region"
            aria-labelledby="live-batches-title"
            tabIndex={0}
          >
            <table>
              <caption className="visually-hidden">
                Live batches from Supabase visible to the current authenticated user.
              </caption>
              <thead>
                <tr>
                  <th scope="col">Public Ref</th>
                  <th scope="col">Category</th>
                  <th scope="col">Lifecycle state</th>
                  <th scope="col">Review status</th>
                  <th scope="col">Your assignment</th>
                  <th scope="col">Intake</th>
                  <th scope="col">Updated (UTC)</th>
                </tr>
              </thead>
              <tbody>
                {batches.map((b) => {
                  const review = reviewStatusFor(b.state);
                  const myRoles = assignmentsForUser(b, user.id);
                  return (
                    <tr key={b.id}>
                      <th scope="row">
                        <Link href={`/live-batches/${b.id}`} className="batch-id-link">
                          {b.public_ref}
                        </Link>
                        <span className="muted block">{formatShortUuid(b.id)}</span>
                      </th>
                      <td>{categoryLabel(b.category_code)}</td>
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
                      <td>{myRoles.join(", ") || "Participant"}</td>
                      <td>
                        {b.intake_mass_grams && b.intake_mass_grams > 0
                          ? formatGrams(b.intake_mass_grams)
                          : "Not collected"}
                      </td>
                      <td>
                        <time dateTime={b.updated_at}>{formatUtc(b.updated_at)}</time>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
