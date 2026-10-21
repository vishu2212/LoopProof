"use client";

import { useActionState, useState } from "react";
import {
  cancelBatchAction,
  recordCollectionAction,
  recordReceiptAction,
  submitProcessingAction,
  verifierDecisionAction,
  type LifecycleFormState,
} from "@/app/live-batches/actions";
import { MATERIAL_OPTIONS } from "@/lib/categories";
import { formatGrams } from "@/lib/format";
import { REASON_MEANING } from "@/lib/lifecycle";
import {
  LIVE_REJECT_REASONS,
  LIVE_RETURN_REASONS,
  LIVE_VERIFIER_CHECKLIST,
  MAX_PROCESSING_OUTPUTS,
  getVerifierDecisionSubmitLabel,
  hasMassDiscrepancy,
  resolveBatchLifecycleAccess,
  validateVerifierDecisionReason,
  type AppRole,
  type AuthenticatedActor,
  type LiveBatchRow,
  type ProcessingOutputInput,
} from "@/lib/live-batches";

type Props = {
  batch: LiveBatchRow;
  currentUser: AuthenticatedActor;
  roles: AppRole[];
  claimedOutputGrams?: number | null;
  currentOutputs?: ProcessingOutputInput[];
};

const INITIAL_FORM_STATE: LifecycleFormState = { status: "idle" };

function CollectorActionForm({ batchId }: { batchId: string }) {
  const [state, formAction, isPending] = useActionState(
    recordCollectionAction,
    INITIAL_FORM_STATE,
  );
  const [intakeMass, setIntakeMass] = useState("10000");

  const parsedIntake = Number(intakeMass);
  const intakeValid = Number.isInteger(parsedIntake) && parsedIntake > 0;

  return (
    <div className="lifecycle-action-panel">
      <div className="card__header">
        <div>
          <h3 id="collector-action-title">
            Collector Action: Record Collection &amp; Intake Weight (
            <code>REGISTERED → COLLECTED</code>)
          </h3>
          <p className="muted card__subtitle">
            Uploads collection evidence to the private <code>evidence</code> Storage bucket and
            executes <code>public.lp_record_collection</code>. Collected does not mean recycled.
          </p>
        </div>
        <span className="badge-pill">Collector Authorized</span>
      </div>

      <form action={formAction} className="register-form" aria-labelledby="collector-action-title">
        <input type="hidden" name="batchId" value={batchId} />

        <div className="form-grid-2">
          <div className="form-field">
            <label htmlFor="intakeMassGrams" className="form-label">
              Recorded Intake Weight (grams, write-once)
            </label>
            <input
              id="intakeMassGrams"
              name="intakeMassGrams"
              type="number"
              min={1}
              step={1}
              required
              value={intakeMass}
              onChange={(e) => setIntakeMass(e.target.value)}
              className="form-input form-input--mono"
            />
            <span className="form-hint">
              Whole number &gt; 0 grams. Establishes the upper bound for processor mass-balance
              checks (<code>intakeValid: {intakeValid ? formatGrams(parsedIntake) : "invalid"}</code>
              ).
            </span>
          </div>

          <div className="form-field">
            <label htmlFor="collectorEvidenceFile" className="form-label">
              Collection Evidence File (<code>collection_record</code>)
            </label>
            <input
              id="collectorEvidenceFile"
              name="evidenceFile"
              type="file"
              accept="application/pdf,image/jpeg,image/png"
              required
              className="form-input"
            />
            <span className="form-hint">
              Required: PDF, JPEG, or PNG (max 20 MB). SHA-256 digest is computed server-side and
              must be globally unique.
            </span>
          </div>
        </div>

        {!intakeValid ? (
          <div className="form-alert form-alert--error" role="alert">
            Intake weight must be a whole number greater than 0 grams.
          </div>
        ) : null}

        {state.status === "error" ? (
          <div className="form-alert form-alert--error" role="alert">
            <strong>Collection RPC failed ({state.code}):</strong> {state.message}
          </div>
        ) : null}

        {state.status === "success" ? (
          <div className="form-alert form-alert--ok" role="status">
            <strong>{state.message}</strong>
          </div>
        ) : null}

        <div className="form-actions">
          <button
            type="submit"
            className="btn btn--primary"
            disabled={isPending || !intakeValid}
          >
            {isPending
              ? "Uploading evidence & recording collection…"
              : "Record Collection (COLLECTED)"}
          </button>
          <span className="muted form-footnote">
            Calls <code>public.lp_record_collection</code>.
          </span>
        </div>
      </form>
    </div>
  );
}

function ProcessorReceiptForm({
  batchId,
  intakeMassGrams,
}: {
  batchId: string;
  intakeMassGrams: number | null;
}) {
  const [state, formAction, isPending] = useActionState(
    recordReceiptAction,
    INITIAL_FORM_STATE,
  );

  return (
    <div className="lifecycle-action-panel">
      <div className="card__header">
        <div>
          <h3 id="processor-receipt-title">
            Processor Action: Record Facility Receipt (<code>COLLECTED → RECEIVED</code>)
          </h3>
          <p className="muted card__subtitle">
            Uploads facility receipt evidence to the private <code>evidence</code> Storage bucket
            and executes <code>public.lp_record_receipt</code>. Recorded collector intake:{" "}
            <strong>
              {intakeMassGrams && intakeMassGrams > 0 ? formatGrams(intakeMassGrams) : "—"}
            </strong>
            .
          </p>
        </div>
        <span className="badge-pill">Processor Authorized</span>
      </div>

      <form
        action={formAction}
        className="register-form"
        aria-labelledby="processor-receipt-title"
      >
        <input type="hidden" name="batchId" value={batchId} />

        <div className="form-field">
          <label htmlFor="receiptEvidenceFile" className="form-label">
            Facility Receipt Evidence File (<code>receipt_record</code>)
          </label>
          <input
            id="receiptEvidenceFile"
            name="evidenceFile"
            type="file"
            accept="application/pdf,image/jpeg,image/png"
            required
            className="form-input"
          />
          <span className="form-hint">
            Required: PDF, JPEG, or PNG (max 20 MB). SHA-256 digest must be distinct from all prior
            evidence records.
          </span>
        </div>

        {state.status === "error" ? (
          <div className="form-alert form-alert--error" role="alert">
            <strong>Receipt RPC failed ({state.code}):</strong> {state.message}
          </div>
        ) : null}

        {state.status === "success" ? (
          <div className="form-alert form-alert--ok" role="status">
            <strong>{state.message}</strong>
          </div>
        ) : null}

        <div className="form-actions">
          <button type="submit" className="btn btn--primary" disabled={isPending}>
            {isPending ? "Uploading evidence & recording receipt…" : "Record Receipt (RECEIVED)"}
          </button>
          <span className="muted form-footnote">
            Calls <code>public.lp_record_receipt</code>.
          </span>
        </div>
      </form>
    </div>
  );
}

function ProcessorClaimForm({
  batchId,
  mode,
  intakeMassGrams,
  nextRevision,
  initialOutputs,
}: {
  batchId: string;
  mode: "submit" | "resubmit";
  intakeMassGrams: number | null;
  nextRevision: number;
  initialOutputs?: ProcessingOutputInput[];
}) {
  const [state, formAction, isPending] = useActionState(
    submitProcessingAction,
    INITIAL_FORM_STATE,
  );
  const intake = intakeMassGrams ?? 0;
  const defaultMass = intake > 0 ? intake : 1000;

  const [outputs, setOutputs] = useState<ProcessingOutputInput[]>(() =>
    initialOutputs && initialOutputs.length > 0
      ? initialOutputs.map((o) => ({
          material_code: Number(o.material_code),
          mass_grams: Number(o.mass_grams),
        }))
      : [{ material_code: MATERIAL_OPTIONS[0].code, mass_grams: defaultMass }],
  );

  const totalOutputGrams = outputs.reduce(
    (sum, item) => sum + (Number.isFinite(Number(item.mass_grams)) ? Number(item.mass_grams) : 0),
    0,
  );
  const massBalanceExceeded = intake > 0 && totalOutputGrams > intake;
  const unrecoveredGrams = intake > 0 ? Math.max(0, intake - totalOutputGrams) : 0;

  const hasInvalidRow = outputs.some(
    (o) =>
      !Number.isInteger(Number(o.material_code)) ||
      Number(o.material_code) < 1 ||
      Number(o.material_code) > 65535 ||
      !Number.isInteger(Number(o.mass_grams)) ||
      Number(o.mass_grams) <= 0,
  );

  const addOutputRow = () => {
    if (outputs.length >= MAX_PROCESSING_OUTPUTS) return;
    const nextMat =
      MATERIAL_OPTIONS[outputs.length % MATERIAL_OPTIONS.length]?.code ?? 201;
    setOutputs((prev) => [...prev, { material_code: nextMat, mass_grams: 100 }]);
  };

  const removeOutputRow = (idx: number) => {
    if (outputs.length <= 1) return;
    setOutputs((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateRow = (idx: number, patch: Partial<ProcessingOutputInput>) => {
    setOutputs((prev) =>
      prev.map((row, i) => (i === idx ? { ...row, ...patch } : row)),
    );
  };

  const rpcName =
    mode === "resubmit" ? "public.lp_resubmit_processing" : "public.lp_submit_processing";
  const transitionLabel =
    mode === "resubmit"
      ? "RETURNED → PROCESSED_CLAIMED"
      : "RECEIVED → PROCESSED_CLAIMED";

  return (
    <div className="lifecycle-action-panel">
      <div className="card__header">
        <div>
          <h3 id="processor-claim-title">
            Processor Action:{" "}
            {mode === "resubmit"
              ? "Resubmit Processing Claim with New Evidence"
              : "Submit Processing Claim"}{" "}
            (<code>{transitionLabel}</code> · Revision #{nextRevision})
          </h3>
          <p className="muted card__subtitle">
            Uploads processing evidence to the private <code>evidence</code> Storage bucket and
            executes <code>{rpcName}</code>. Records a processing claim and output fractions — not
            proof that physical recycling occurred.
          </p>
        </div>
        <span className="badge-pill">Processor Authorized</span>
      </div>

      <form action={formAction} className="register-form" aria-labelledby="processor-claim-title">
        <input type="hidden" name="batchId" value={batchId} />
        <input type="hidden" name="mode" value={mode} />
        <input type="hidden" name="intakeMassGrams" value={intake} />
        <input type="hidden" name="outputsJson" value={JSON.stringify(outputs)} />

        <div className="outputs-editor">
          <div className="form-label-row">
            <span className="form-label">
              Claimed Output Fractions (<code>p_outputs</code>, 1–{MAX_PROCESSING_OUTPUTS} items)
            </span>
            <button
              type="button"
              className="text-btn"
              onClick={addOutputRow}
              disabled={outputs.length >= MAX_PROCESSING_OUTPUTS}
            >
              + Add output fraction ({outputs.length}/{MAX_PROCESSING_OUTPUTS})
            </button>
          </div>

          <div className="outputs-editor__rows">
            {outputs.map((row, idx) => (
              <div key={idx} className="outputs-editor__row">
                <div className="form-field">
                  <label htmlFor={`output-preset-${idx}`} className="form-label">
                    Fraction #{idx + 1} Material Preset
                  </label>
                  <select
                    id={`output-preset-${idx}`}
                    value={
                      MATERIAL_OPTIONS.some((m) => m.code === row.material_code)
                        ? row.material_code
                        : "custom"
                    }
                    onChange={(e) => {
                      if (e.target.value !== "custom") {
                        updateRow(idx, { material_code: Number(e.target.value) });
                      }
                    }}
                    className="form-input"
                  >
                    {MATERIAL_OPTIONS.map((m) => (
                      <option key={m.code} value={m.code}>
                        #{m.code} — {m.name}
                      </option>
                    ))}
                    <option value="custom">Custom material code (1–65535)</option>
                  </select>
                </div>

                <div className="form-field">
                  <label htmlFor={`output-code-${idx}`} className="form-label">
                    Material Code (1–65535)
                  </label>
                  <input
                    id={`output-code-${idx}`}
                    type="number"
                    min={1}
                    max={65535}
                    step={1}
                    required
                    value={row.material_code}
                    onChange={(e) => updateRow(idx, { material_code: Number(e.target.value) })}
                    className="form-input form-input--mono"
                  />
                </div>

                <div className="form-field">
                  <label htmlFor={`output-mass-${idx}`} className="form-label">
                    Output Mass (grams)
                  </label>
                  <input
                    id={`output-mass-${idx}`}
                    type="number"
                    min={1}
                    step={1}
                    required
                    value={row.mass_grams}
                    onChange={(e) => updateRow(idx, { mass_grams: Number(e.target.value) })}
                    className="form-input form-input--mono"
                  />
                </div>

                <div className="outputs-editor__remove">
                  <button
                    type="button"
                    className="btn"
                    onClick={() => removeOutputRow(idx)}
                    disabled={outputs.length <= 1}
                    aria-label={`Remove output fraction #${idx + 1}`}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="mass-balance-bar" role="status" aria-live="polite">
            <span>
              <strong>Total claimed output:</strong> {formatGrams(totalOutputGrams)} /{" "}
              <strong>Recorded intake:</strong> {intake > 0 ? formatGrams(intake) : "Not recorded"}
            </span>
            <span className="muted">
              Unrecovered process loss: {formatGrams(unrecoveredGrams)}
            </span>
          </div>
        </div>

        {massBalanceExceeded ? (
          <div className="form-alert form-alert--error" role="alert">
            <strong>Mass-balance rule violation (STATE_MACHINE rule 5):</strong> Total claimed
            outputs ({formatGrams(totalOutputGrams)}) cannot exceed the recorded intake mass (
            {formatGrams(intake)}).
          </div>
        ) : null}

        {hasInvalidRow ? (
          <div className="form-alert form-alert--error" role="alert">
            Every output fraction must have an integer <code>material_code</code> (1–65535) and an
            integer <code>mass_grams</code> &gt; 0.
          </div>
        ) : null}

        <div className="form-field">
          <label htmlFor="processingEvidenceFile" className="form-label">
            {mode === "resubmit"
              ? "New Processing Claim Evidence File (must have a new SHA-256 digest)"
              : "Processing Claim Evidence File"}{" "}
            (<code>processing_claim</code>, Revision #{nextRevision})
          </label>
          <input
            id="processingEvidenceFile"
            name="evidenceFile"
            type="file"
            accept="application/pdf,image/jpeg,image/png"
            required
            className="form-input"
          />
          <span className="form-hint">
            Required: PDF, JPEG, or PNG (max 20 MB).{" "}
            {mode === "resubmit"
              ? "Resubmitting after RETURNED requires a genuinely new evidence file (duplicate SHA-256 hashes are rejected by the database)."
              : "SHA-256 digest is computed server-side and anchored in public.evidence."}
          </span>
        </div>

        {state.status === "error" ? (
          <div className="form-alert form-alert--error" role="alert">
            <strong>Processing claim RPC failed ({state.code}):</strong> {state.message}
          </div>
        ) : null}

        {state.status === "success" ? (
          <div className="form-alert form-alert--ok" role="status">
            <strong>{state.message}</strong>
          </div>
        ) : null}

        <div className="form-actions">
          <button
            type="submit"
            className="btn btn--primary"
            disabled={isPending || massBalanceExceeded || hasInvalidRow || intake <= 0}
          >
            {isPending
              ? "Uploading evidence & submitting claim…"
              : mode === "resubmit"
                ? `Resubmit Processing Claim (Revision #${nextRevision})`
                : "Submit Processing Claim (PROCESSED_CLAIMED)"}
          </button>
          <span className="muted form-footnote">
            Calls <code>{rpcName}</code>.
          </span>
        </div>
      </form>
    </div>
  );
}

function VerifierDecisionForm({
  batchId,
  currentRevision,
  intakeMassGrams,
  claimedOutputGrams,
}: {
  batchId: string;
  currentRevision: number;
  intakeMassGrams?: number | null;
  claimedOutputGrams?: number | null;
}) {
  const [state, formAction, isPending] = useActionState(
    verifierDecisionAction,
    INITIAL_FORM_STATE,
  );
  const [checked, setChecked] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(LIVE_VERIFIER_CHECKLIST.map((item) => [item.key, false])),
  );
  const [decision, setDecision] = useState<"verified" | "returned" | "rejected">("verified");
  const [returnReason, setReturnReason] = useState<string>("");
  const [rejectReason, setRejectReason] = useState<string>("");
  const [validationError, setValidationError] = useState<string | null>(null);

  const tickedCount = LIVE_VERIFIER_CHECKLIST.filter((item) => checked[item.key]).length;
  const massDiscrepancyPresent = hasMassDiscrepancy({
    intakeMassGrams,
    claimedOutputGrams,
  });

  const submitLabel = getVerifierDecisionSubmitLabel(decision);

  const rpcLabel =
    decision === "verified"
      ? "public.lp_verify_batch"
      : decision === "returned"
        ? "public.lp_return_batch"
        : "public.lp_reject_batch";

  function handleDecisionChange(nextDecision: "verified" | "returned" | "rejected") {
    setDecision(nextDecision);
    setValidationError(null);
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    const check = validateVerifierDecisionReason(decision, returnReason, rejectReason, {
      intakeMassGrams,
      claimedOutputGrams,
    });
    if (!check.ok) {
      e.preventDefault();
      setValidationError(check.error);
      return;
    }
    setValidationError(null);
  }

  return (
    <div className="lifecycle-action-panel">
      <div className="card__header">
        <div>
          <h3 id="verifier-decision-title">
            Independent Verifier Action: Review Processing Claim (Revision #{currentRevision})
          </h3>
          <p className="muted card__subtitle">
            Complete the independent verification checklist and record your decision via{" "}
            <code>public.lp_verify_batch</code>, <code>public.lp_return_batch</code>, or{" "}
            <code>public.lp_reject_batch</code>. Your checklist responses are stored in{" "}
            <code>public.verifier_decisions.checklist</code>.
          </p>
        </div>
        <span className="badge-pill">Independent Verifier Authorized</span>
      </div>

      <form
        action={formAction}
        onSubmit={handleSubmit}
        noValidate
        className="register-form"
        aria-labelledby="verifier-decision-title"
      >
        <input type="hidden" name="batchId" value={batchId} />
        <input type="hidden" name="checklistJson" value={JSON.stringify(checked)} />
        {typeof intakeMassGrams === "number" ? (
          <input type="hidden" name="intakeMassGrams" value={intakeMassGrams} />
        ) : null}
        {typeof claimedOutputGrams === "number" ? (
          <input type="hidden" name="claimedOutputGrams" value={claimedOutputGrams} />
        ) : null}

        <fieldset className="checklist">
          <legend>Independent Verification Checklist (persisted in Supabase)</legend>
          <p className="muted" id="live-checklist-note">
            Attest each verification check for Revision #{currentRevision}. Stored as a boolean JSON
            map in <code>public.verifier_decisions</code>.
          </p>
          <ul>
            {LIVE_VERIFIER_CHECKLIST.map((item) => (
              <li key={item.key}>
                <label>
                  <input
                    type="checkbox"
                    checked={Boolean(checked[item.key])}
                    onChange={(e) =>
                      setChecked((prev) => ({
                        ...prev,
                        [item.key]: e.target.checked,
                      }))
                    }
                    aria-describedby="live-checklist-note"
                  />
                  <span>
                    {item.label} <code className="muted">({item.key})</code>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <p role="status" aria-live="polite" className="checklist__count">
            {tickedCount} of {LIVE_VERIFIER_CHECKLIST.length} checklist items attested
          </p>
        </fieldset>

        <fieldset className="decision-selector">
          <legend className="form-label">Select Verifier Decision</legend>
          <div className="form-grid-3">
            <label
              className={`decision-option ${
                decision === "verified" ? "decision-option--active-ok" : ""
              }`}
            >
              <input
                type="radio"
                name="decision"
                value="verified"
                checked={decision === "verified"}
                onChange={() => handleDecisionChange("verified")}
              />
              <div>
                <strong>Approve &amp; Verify Claim (VERIFIED)</strong>
                <span className="block muted">
                  Accepts the processing claim via <code>lp_verify_batch</code>. Terminal state.
                </span>
              </div>
            </label>

            <label
              className={`decision-option ${
                decision === "returned" ? "decision-option--active-warn" : ""
              }`}
            >
              <input
                type="radio"
                name="decision"
                value="returned"
                checked={decision === "returned"}
                onChange={() => handleDecisionChange("returned")}
              />
              <div>
                <strong>Return for More Evidence (RETURNED)</strong>
                <span className="block muted">
                  Requests resubmission with a new evidence file via <code>lp_return_batch</code>.
                </span>
              </div>
            </label>

            <label
              className={`decision-option ${
                decision === "rejected" ? "decision-option--active-bad" : ""
              }`}
            >
              <input
                type="radio"
                name="decision"
                value="rejected"
                checked={decision === "rejected"}
                onChange={() => handleDecisionChange("rejected")}
              />
              <div>
                <strong>Reject Claim (REJECTED)</strong>
                <span className="block muted">
                  Permanently rejects the processing claim via <code>lp_reject_batch</code>.
                </span>
              </div>
            </label>
          </div>
        </fieldset>

        {decision === "returned" ? (
          <div className="form-field">
            <label htmlFor="returnReason" className="form-label">
              Return Reason Code (<code>public.return_reason</code>, D-14)
            </label>
            <select
              id="returnReason"
              name="returnReason"
              value={returnReason}
              onChange={(e) => {
                setReturnReason(e.target.value);
                setValidationError(null);
              }}
              className="form-input"
            >
              <option value="">Select a return reason…</option>
              {LIVE_RETURN_REASONS.map((code) => {
                const isMassDiscrepancyBlocked =
                  code === "MASS_DISCREPANCY" && !massDiscrepancyPresent;
                return (
                  <option
                    key={code}
                    value={code}
                    disabled={isMassDiscrepancyBlocked}
                  >
                    {code} — {REASON_MEANING[code]}
                    {isMassDiscrepancyBlocked
                      ? " (0 g unaccounted — no mass discrepancy)"
                      : ""}
                  </option>
                );
              })}
            </select>
            <span className="form-hint">
              Reasons are standardized enum codes only (no free text). Processor must upload new
              evidence to resubmit.
            </span>
          </div>
        ) : null}

        {decision === "rejected" ? (
          <div className="form-field">
            <label htmlFor="rejectReason" className="form-label">
              Rejection Reason Code (<code>public.reject_reason</code>, D-14)
            </label>
            <select
              id="rejectReason"
              name="rejectReason"
              value={rejectReason}
              onChange={(e) => {
                setRejectReason(e.target.value);
                setValidationError(null);
              }}
              className="form-input"
            >
              <option value="">Select a rejection reason…</option>
              {LIVE_REJECT_REASONS.map((code) => (
                <option key={code} value={code}>
                  {code} — {REASON_MEANING[code]}
                </option>
              ))}
            </select>
            <span className="form-hint">
              Rejection is a terminal outcome; the batch cannot be modified afterward.
            </span>
          </div>
        ) : null}

        {validationError ? (
          <div className="form-alert form-alert--error" role="alert">
            <strong>Validation error (INVALID_REASON):</strong> {validationError}
          </div>
        ) : null}

        {!validationError && state.status === "error" ? (
          <div className="form-alert form-alert--error" role="alert">
            <strong>Verifier decision RPC failed ({state.code}):</strong> {state.message}
          </div>
        ) : null}

        {state.status === "success" ? (
          <div className="form-alert form-alert--ok" role="status">
            <strong>{state.message}</strong>
          </div>
        ) : null}

        <div className="form-actions">
          <button type="submit" className="btn btn--primary" disabled={isPending}>
            {isPending ? "Recording verifier decision…" : submitLabel}
          </button>
          <span className="muted form-footnote">
            Calls <code>{rpcLabel}</code>.
          </span>
        </div>
      </form>
    </div>
  );
}

function RegistrarCancelForm({ batchId }: { batchId: string }) {
  const [state, formAction, isPending] = useActionState(
    cancelBatchAction,
    INITIAL_FORM_STATE,
  );

  return (
    <div className="lifecycle-action-panel lifecycle-action-panel--secondary">
      <div className="card__header">
        <div>
          <h3 id="registrar-cancel-title">
            Registrar Action: Withdraw Batch Before Collection (
            <code>REGISTERED → CANCELLED</code>)
          </h3>
          <p className="muted card__subtitle">
            Only the assigned registrar may cancel a batch, and only while it remains in{" "}
            <code>REGISTERED</code> state prior to collection (<code>public.lp_cancel_batch</code>).
          </p>
        </div>
        <span className="badge-pill">Registrar Authorized</span>
      </div>

      <form action={formAction} className="register-form" aria-labelledby="registrar-cancel-title">
        <input type="hidden" name="batchId" value={batchId} />

        {state.status === "error" ? (
          <div className="form-alert form-alert--error" role="alert">
            <strong>Cancel RPC failed ({state.code}):</strong> {state.message}
          </div>
        ) : null}

        {state.status === "success" ? (
          <div className="form-alert form-alert--ok" role="status">
            <strong>{state.message}</strong>
          </div>
        ) : null}

        <div className="form-actions">
          <button type="submit" className="btn" disabled={isPending}>
            {isPending ? "Cancelling batch…" : "Cancel Batch Before Collection (CANCELLED)"}
          </button>
          <span className="muted form-footnote">
            Terminal outcome. Calls <code>public.lp_cancel_batch</code>.
          </span>
        </div>
      </form>
    </div>
  );
}

export function LiveLifecycleActions({
  batch,
  currentUser,
  roles,
  claimedOutputGrams,
  currentOutputs,
}: Props) {
  const access = resolveBatchLifecycleAccess(batch, currentUser, roles);

  return (
    <section className="card" aria-labelledby="live-actions-title">
      <div className="card__header">
        <div>
          <h2 id="live-actions-title">Role-Specific Lifecycle Actions (Supabase RPC)</h2>
          <p className="muted card__subtitle">{access.waitingForSummary}</p>
        </div>
        <span className="badge-pill">
          {access.allowedActions.length > 0
            ? `${access.allowedActions.length} action${
                access.allowedActions.length === 1 ? "" : "s"
              } available`
            : "Read-only for your session"}
        </span>
      </div>

      {access.independenceViolation ? (
        <div className="form-alert form-alert--error" role="alert">
          <strong>Verifier independence rule (STATE_MACHINE rule 3):</strong>{" "}
          {access.independenceViolation}
        </div>
      ) : null}

      {access.missingRoleNotices.map((notice) => (
        <div
          key={notice.requiredRole}
          className="form-alert form-alert--warn"
          role="alert"
        >
          <strong>Missing role {notice.requiredRole}:</strong> {notice.message} Grant{" "}
          <code>{notice.requiredRole}</code> to <code>{currentUser.id}</code> in{" "}
          <code>public.user_roles</code> to unlock this transition.
        </div>
      ))}

      {access.allowedActions.includes("record_collection") ? (
        <CollectorActionForm batchId={batch.id} />
      ) : null}

      {access.allowedActions.includes("record_receipt") ? (
        <ProcessorReceiptForm
          batchId={batch.id}
          intakeMassGrams={batch.intake_mass_grams}
        />
      ) : null}

      {access.allowedActions.includes("submit_processing") ? (
        <ProcessorClaimForm
          key={`submit-${batch.id}-${batch.current_revision}`}
          batchId={batch.id}
          mode="submit"
          intakeMassGrams={batch.intake_mass_grams}
          nextRevision={batch.current_revision + 1}
          initialOutputs={currentOutputs}
        />
      ) : null}

      {access.allowedActions.includes("resubmit_processing") ? (
        <ProcessorClaimForm
          key={`resubmit-${batch.id}-${batch.current_revision}`}
          batchId={batch.id}
          mode="resubmit"
          intakeMassGrams={batch.intake_mass_grams}
          nextRevision={batch.current_revision + 1}
          initialOutputs={currentOutputs}
        />
      ) : null}

      {access.allowedActions.includes("verifier_decision") ? (
        <VerifierDecisionForm
          key={`verifier-${batch.id}-${batch.current_revision}`}
          batchId={batch.id}
          currentRevision={batch.current_revision}
          intakeMassGrams={batch.intake_mass_grams}
          claimedOutputGrams={claimedOutputGrams}
        />
      ) : null}

      {access.allowedActions.includes("cancel_batch") ? (
        <RegistrarCancelForm batchId={batch.id} />
      ) : null}

      {access.allowedActions.length === 0 &&
      !access.independenceViolation &&
      access.missingRoleNotices.length === 0 ? (
        <div className="empty-state" role="status">
          <p>
            <strong>No lifecycle transition controls are active for your account right now.</strong>
          </p>
          <p className="muted">
            Actions are displayed only when your signed-in account (<code>{currentUser.id}</code>)
            holds the matching role in <code>public.user_roles</code>, is the participant locked to
            this batch for the active stage, and the batch is in a non-terminal state.
          </p>
        </div>
      ) : null}
    </section>
  );
}
