import type { Metadata } from "next";
import Link from "next/link";
import { LoginForm } from "@/components/LoginForm";
import { UserSessionBanner } from "@/components/UserSessionBanner";
import { getCurrentUserWithRoles } from "@/lib/live-batches";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sign In — Live Registry",
};

export default async function LoginPage() {
  let sessionState: Awaited<ReturnType<typeof getCurrentUserWithRoles>> = {
    user: null,
    roles: [],
  };
  let configError: string | null = null;

  try {
    const supabase = await createSupabaseServerClient();
    sessionState = await getCurrentUserWithRoles(supabase);
  } catch (err) {
    configError = err instanceof Error ? err.message : "Supabase configuration error.";
  }

  return (
    <div className="page">
      <header className="page-header">
        <h1>LoopProof Live Registry Sign In</h1>
        <p className="lede">
          Sign in with your Supabase account to view RLS-scoped batch records and, if granted the{" "}
          <code>registrar</code> role, register new batches via{" "}
          <code>public.lp_register_batch</code>.
        </p>
      </header>

      {configError ? (
        <section className="card" role="alert">
          <h2>Supabase Configuration Missing</h2>
          <p className="form-alert form-alert--error">{configError}</p>
        </section>
      ) : null}

      <UserSessionBanner
        user={sessionState.user}
        roles={sessionState.roles}
        roleError={sessionState.roleError}
      />

      {sessionState.user ? (
        <section className="card">
          <h2>Active Session Ready</h2>
          <p className="muted">
            You are currently authenticated. Proceed to the Live Batch Registry to inspect batches
            where you are an assigned participant or register a new batch.
          </p>
          <p>
            <Link href="/live-batches" className="btn btn--primary">
              Open Live Batch Registry →
            </Link>{" "}
            <Link href="/" className="btn">
              View Synthetic Demo Dashboard
            </Link>
          </p>
        </section>
      ) : (
        <section className="card" style={{ maxWidth: "34rem" }} aria-labelledby="signin-heading">
          <div className="card__header">
            <div>
              <h2 id="signin-heading">Credentials</h2>
              <p className="muted card__subtitle">
                Session cookies are managed server-side via <code>@supabase/ssr</code>.
              </p>
            </div>
          </div>
          <LoginForm />
        </section>
      )}
    </div>
  );
}
