"use client";

import { useState } from "react";
import type { ChecklistItem } from "@/lib/demo-data";

/**
 * Local-only checklist. State lives in the browser tab and is NOT saved,
 * sent anywhere, or written to any contract. Ticking items does not verify,
 * return, or reject a batch — only the assigned verifier can do that on-chain.
 */
export function ReviewChecklist({ items }: { items: ChecklistItem[] }) {
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const done = items.filter((i) => checked[i.id]).length;
  const allChecked = items.length > 0 && done === items.length;
  const progressPct = items.length > 0 ? Math.round((done / items.length) * 100) : 0;

  return (
    <fieldset className="checklist">
      <legend>Independent Verifier Review Checklist</legend>
      <p className="muted" id="checklist-note">
        Interactive demonstration checklist. Ticking items here simulates the verifier audit
        workflow in the client tab. No on-chain state or database row is modified without an
        authorized verifier transaction.
      </p>

      <div
        className="checklist-progress"
        role="progressbar"
        aria-valuenow={done}
        aria-valuemin={0}
        aria-valuemax={items.length}
        aria-valuetext={`${done} of ${items.length} criteria satisfied (${progressPct}%)`}
      >
        <div className="checklist-progress__bar">
          <div
            className={`checklist-progress__fill ${allChecked ? "checklist-progress__fill--complete" : ""}`}
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <div className="checklist-progress__meta">
          <span className="checklist-progress__label">Audit criteria completed:</span>
          <strong>{done} of {items.length} ({progressPct}%)</strong>
        </div>
      </div>

      <ul className="checklist__list">
        {items.map((item) => {
          const isDone = !!checked[item.id];
          return (
            <li key={item.id} className={`checklist__item ${isDone ? "is-checked" : ""}`}>
              <label>
                <input
                  type="checkbox"
                  checked={isDone}
                  onChange={(e) => setChecked((c) => ({ ...c, [item.id]: e.target.checked }))}
                  aria-describedby="checklist-note"
                />
                <span className="checklist__label-text">{item.label}</span>
              </label>
            </li>
          );
        })}
      </ul>

      {allChecked ? (
        <div className="checklist__complete-banner" role="status" aria-live="polite">
          <strong>
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              style={{ display: "inline-block", verticalAlign: "middle", marginRight: "4px" }}
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
            All verification criteria satisfied
          </strong>
          <span>In production, the assigned verifier key would sign the <code>lp_verify_batch</code> transaction.</span>
        </div>
      ) : null}

      <div className="checklist__actions">
        <button
          type="button"
          className="btn btn--sm"
          onClick={() => setChecked({})}
          disabled={done === 0}
        >
          Reset checklist ({done})
        </button>
        <button
          type="button"
          className="btn btn--sm"
          onClick={() => {
            const all: Record<string, boolean> = {};
            items.forEach((i) => {
              all[i.id] = true;
            });
            setChecked(all);
          }}
          disabled={allChecked}
        >
          Select all
        </button>
      </div>

      <div className="checklist__simulated-decision">
        <span className="checklist__simulated-title">Simulated Verifier Decision Controls (Read-Only)</span>
        <div className="checklist__simulated-buttons">
          <button
            type="button"
            className="btn btn--sm btn--disabled"
            disabled
            title="Disabled in demo: requires assigned verifier signature"
          >
            🔒 Verify Batch (Key Required)
          </button>
          <button
            type="button"
            className="btn btn--sm btn--disabled"
            disabled
            title="Disabled in demo: requires assigned verifier signature"
          >
            🔒 Return for Rectification
          </button>
          <button
            type="button"
            className="btn btn--sm btn--disabled"
            disabled
            title="Disabled in demo: requires assigned verifier signature"
          >
            🔒 Reject Batch
          </button>
        </div>
        <p className="checklist__simulated-hint muted">
          Actions disabled: verifier decisions are cryptographically enforced on-chain (D-15).
          Only the assigned verifier key may record a state transition.
        </p>
      </div>
    </fieldset>
  );
}
