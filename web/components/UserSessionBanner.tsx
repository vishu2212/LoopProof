import Link from "next/link";
import { signOutAction } from "@/app/live-batches/actions";
import { APP_ROLES, type AppRole, type AuthenticatedActor } from "@/lib/live-batches";

type Props = {
  user: AuthenticatedActor | null;
  roles: AppRole[];
  roleError?: string;
};

export function UserSessionBanner({ user, roles, roleError }: Props) {
  if (!user) {
    return (
      <section className="card session-card" aria-label="Authentication status">
        <div className="session-card__row">
          <div>
            <span className="eyebrow">Supabase Auth Session</span>
            <p className="session-card__user">
              <strong>Not signed in</strong> — live batch records and registration require an
              authenticated LoopProof account.
            </p>
          </div>
          <Link href="/login" className="btn btn--primary">
            Sign in to Live Registry
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="card session-card" aria-label="Signed-in user and assigned roles">
      <div className="session-card__row">
        <div>
          <span className="eyebrow">Authenticated Supabase Session</span>
          <p className="session-card__user">
            Signed in as <strong>{user.email ?? "Authenticated user"}</strong>{" "}
            <code title="Your Supabase auth.uid()">{user.id}</code>
          </p>
          <div className="session-card__roles" aria-label="Assigned LoopProof roles">
            <span className="muted">Assigned roles in <code>public.user_roles</code>:</span>
            {roles.length === 0 ? (
              <span className="review-pill review-pill--returned">
                No roles assigned yet
              </span>
            ) : (
              APP_ROLES.map((role) => {
                const active = roles.includes(role);
                return (
                  <span
                    key={role}
                    className={`review-pill ${
                      active ? "review-pill--done" : "review-pill--neutral"
                    }`}
                  >
                    {role}: {active ? "Granted" : "Not granted"}
                  </span>
                );
              })
            )}
          </div>
          {roleError ? (
            <p className="form-alert form-alert--error" role="alert">
              Could not read <code>public.user_roles</code>: {roleError}
            </p>
          ) : null}
        </div>
        <form action={signOutAction}>
          <button type="submit" className="btn">
            Sign out
          </button>
        </form>
      </div>
    </section>
  );
}
