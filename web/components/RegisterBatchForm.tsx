"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { registerBatchAction, type RegisterFormState } from "@/app/live-batches/actions";
import { CATEGORY_OPTIONS } from "@/lib/categories";
import type { AppRole } from "@/lib/live-batches";

type Props = {
  currentUserId: string;
  roles: AppRole[];
};

const INITIAL_STATE: RegisterFormState = { status: "idle" };

export function RegisterBatchForm({ currentUserId, roles }: Props) {
  const [state, formAction, isPending] = useActionState(registerBatchAction, INITIAL_STATE);
  const [collectorId, setCollectorId] = useState("");
  const [processorId, setProcessorId] = useState("");
  const [verifierId, setVerifierId] = useState("");

  const hasRegistrarRole = roles.includes("registrar");
  const cTrim = collectorId.trim().toLowerCase();
  const pTrim = processorId.trim().toLowerCase();
  const vTrim = verifierId.trim().toLowerCase();
  const verifierConflict =
    vTrim.length > 0 && (vTrim === cTrim || vTrim === pTrim);

  if (!hasRegistrarRole) {
    return (
      <section className="card" aria-labelledby="register-batch-title">
        <div className="card__header">
          <div>
            <h2 id="register-batch-title">Register New Batch (Protected RPC)</h2>
            <p className="muted card__subtitle">
              Calls <code>public.lp_register_batch</code> using your authenticated session.
            </p>
          </div>
          <span className="review-pill review-pill--returned">Registrar Role Required</span>
        </div>
        <div className="form-alert form-alert--warn" role="note">
          <strong>Registration locked (D-12):</strong> Your account (<code>{currentUserId}</code>)
          does not currently hold the <code>registrar</code> role in{" "}
          <code>public.user_roles</code>. Grant <code>registrar</code> to your user in Supabase to
          enable batch registration.
        </div>
      </section>
    );
  }

  return (
    <section className="card" aria-labelledby="register-batch-title">
      <div className="card__header">
        <div>
          <h2 id="register-batch-title">Register New Batch</h2>
          <p className="muted card__subtitle">
            Executes <code>public.lp_register_batch</code> on the server. A cryptographically
            secure 32-byte <code>claim_key</code> is generated server-side and never exposed to the
            browser or logs.
          </p>
        </div>
        <span className="badge-pill">Registrar Authorized</span>
      </div>

      <form action={formAction} className="register-form">
        <div className="form-field">
          <label htmlFor="categoryCode" className="form-label">
            Human-confirmed E-Waste Category (D-06)
          </label>
          <select
            id="categoryCode"
            name="categoryCode"
            defaultValue={CATEGORY_OPTIONS[0].code}
            required
            className="form-input"
          >
            {CATEGORY_OPTIONS.map((cat) => (
              <option key={cat.code} value={cat.code}>
                #{cat.code} — {cat.name} ({cat.examples})
              </option>
            ))}
          </select>
          <span className="form-hint">
            AI classification is advisory only; the registrar attests the category code (1–65535).
          </span>
        </div>

        <div className="form-grid-3">
          <div className="form-field">
            <div className="form-label-row">
              <label htmlFor="collectorId" className="form-label">
                Assigned Collector UUID
              </label>
              {roles.includes("collector") ? (
                <button
                  type="button"
                  className="text-btn"
                  onClick={() => setCollectorId(currentUserId)}
                >
                  Use my UUID
                </button>
              ) : null}
            </div>
            <input
              id="collectorId"
              name="collectorId"
              type="text"
              required
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              value={collectorId}
              onChange={(e) => setCollectorId(e.target.value)}
              className="form-input form-input--mono"
            />
            <span className="form-hint">
              Must hold <code>collector</code> in <code>public.user_roles</code>.
            </span>
          </div>

          <div className="form-field">
            <div className="form-label-row">
              <label htmlFor="processorId" className="form-label">
                Assigned Processor UUID (locked at registration)
              </label>
              {roles.includes("processor") ? (
                <button
                  type="button"
                  className="text-btn"
                  onClick={() => setProcessorId(currentUserId)}
                >
                  Use my UUID
                </button>
              ) : null}
            </div>
            <input
              id="processorId"
              name="processorId"
              type="text"
              required
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              value={processorId}
              onChange={(e) => setProcessorId(e.target.value)}
              className="form-input form-input--mono"
            />
            <span className="form-hint">
              Must hold <code>processor</code> in <code>public.user_roles</code> (D-15).
            </span>
          </div>

          <div className="form-field">
            <div className="form-label-row">
              <label htmlFor="verifierId" className="form-label">
                Independent Verifier UUID
              </label>
              {roles.includes("verifier") ? (
                <button
                  type="button"
                  className="text-btn"
                  onClick={() => setVerifierId(currentUserId)}
                >
                  Use my UUID
                </button>
              ) : null}
            </div>
            <input
              id="verifierId"
              name="verifierId"
              type="text"
              required
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              value={verifierId}
              onChange={(e) => setVerifierId(e.target.value)}
              className="form-input form-input--mono"
            />
            <span className="form-hint">
              Must hold <code>verifier</code> and differ from collector &amp; processor.
            </span>
          </div>
        </div>

        {verifierConflict ? (
          <p className="form-alert form-alert--error" role="alert">
            Verifier independence violation: the verifier UUID must differ from both the collector
            UUID and the processor UUID (<code>batches_verifier_independent</code>).
          </p>
        ) : null}

        {state.status === "error" ? (
          <div className="form-alert form-alert--error" role="alert">
            <strong>Registration failed ({state.code}):</strong> {state.message}
          </div>
        ) : null}

        {state.status === "success" && state.batchId ? (
          <div className="form-alert form-alert--ok" role="status">
            <strong>{state.message}</strong> Batch UUID:{" "}
            <code>{state.batchId}</code> ·{" "}
            <Link href={`/live-batches/${state.batchId}`}>
              Open live batch detail →
            </Link>
          </div>
        ) : null}

        <div className="form-actions">
          <button
            type="submit"
            className="btn btn--primary"
            disabled={isPending || verifierConflict}
          >
            {isPending ? "Registering batch in Supabase…" : "Register Batch (REGISTERED)"}
          </button>
          <span className="muted form-footnote">
            Initial state is always <code>REGISTERED</code>. Collected does not mean recycled.
          </span>
        </div>
      </form>
    </section>
  );
}
