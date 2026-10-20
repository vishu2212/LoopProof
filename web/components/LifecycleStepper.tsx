import {
  ALTERNATIVE_OUTCOMES,
  CANONICAL_STAGES,
  STATE_LABEL,
  STATE_MEANING,
  type BatchState,
} from "@/lib/lifecycle";

type Props = { current: Exclude<BatchState, "NONE"> };

/**
 * Canonical lifecycle stepper. Only the five happy-path stages are steps.
 * RETURNED / REJECTED / CANCELLED are shown as alternative outcomes, and
 * "Pending verifier review" is NOT rendered here because it is a review status.
 */
export function LifecycleStepper({ current }: Props) {
  const currentIndex = CANONICAL_STAGES.findIndex((s) => s === current);
  const isAlternative = (ALTERNATIVE_OUTCOMES as readonly string[]).includes(current);

  return (
    <div>
      <ol className="stepper" aria-label="Canonical lifecycle">
        {CANONICAL_STAGES.map((stage, i) => {
          let status: "done" | "current" | "upcoming" = "upcoming";
          if (!isAlternative) {
            if (i < currentIndex) status = "done";
            else if (i === currentIndex) status = "current";
          }
          const statusText =
            status === "done" ? "completed" : status === "current" ? "current stage" : "not reached";
          return (
            <li
              key={stage}
              className={`stepper__item stepper__item--${status}`}
              aria-current={status === "current" ? "step" : undefined}
            >
              <span className="stepper__marker" aria-hidden="true">
                {status === "done" ? "✓" : i + 1}
              </span>
              <span className="stepper__text">
                <span className="stepper__name">{STATE_LABEL[stage]}</span>
                <span className="stepper__code">{stage}</span>
                <span className="visually-hidden"> ({statusText})</span>
                <span className="stepper__meaning">{STATE_MEANING[stage]}</span>
              </span>
            </li>
          );
        })}
      </ol>

      <section className="alt-outcomes" aria-labelledby="alt-outcomes-title">
        <h3 id="alt-outcomes-title">Alternative outcomes</h3>
        <p className="muted">These are not stages of the normal path.</p>
        <ul>
          {ALTERNATIVE_OUTCOMES.map((o) => (
            <li key={o} className={o === current ? "is-current" : undefined}>
              <strong>{STATE_LABEL[o]}</strong> <code>{o}</code>
              {o === current ? <span className="visually-hidden"> (this batch)</span> : null}
              <span className="muted"> — {STATE_MEANING[o]}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
