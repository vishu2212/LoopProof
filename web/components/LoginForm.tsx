"use client";

import { useActionState } from "react";
import { signInAction, type LoginFormState } from "@/app/login/actions";

const INITIAL_STATE: LoginFormState = { status: "idle" };

export function LoginForm() {
  const [state, formAction, isPending] = useActionState(signInAction, INITIAL_STATE);

  return (
    <form action={formAction} className="register-form">
      <div className="form-field">
        <label htmlFor="email" className="form-label">
          Email address
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          placeholder="registrar@example.org"
          className="form-input"
        />
      </div>

      <div className="form-field">
        <label htmlFor="password" className="form-label">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="form-input"
        />
      </div>

      {state.status === "error" ? (
        <div className="form-alert form-alert--error" role="alert">
          <strong>Sign-in failed:</strong> {state.message}
        </div>
      ) : null}

      <div className="form-actions">
        <button type="submit" className="btn btn--primary" disabled={isPending}>
          {isPending ? "Signing in…" : "Sign in with Supabase Auth"}
        </button>
      </div>
    </form>
  );
}
