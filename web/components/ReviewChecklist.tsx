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

  return (
    <fieldset className="checklist">
      <legend>Verifier review checklist (demo)</legend>
      <p className="muted" id="checklist-note">
        Local to this page only. Not saved, not submitted, and not connected to any backend or
        contract. Ticking items does not verify the batch.
      </p>
      <ul>
        {items.map((item) => (
          <li key={item.id}>
            <label>
              <input
                type="checkbox"
                checked={!!checked[item.id]}
                onChange={(e) => setChecked((c) => ({ ...c, [item.id]: e.target.checked }))}
                aria-describedby="checklist-note"
              />
              <span>{item.label}</span>
            </label>
          </li>
        ))}
      </ul>
      <p role="status" aria-live="polite" className="checklist__count">
        {done} of {items.length} items ticked (local only)
      </p>
      <button type="button" className="btn" onClick={() => setChecked({})} disabled={done === 0}>
        Clear ticks
      </button>
    </fieldset>
  );
}
