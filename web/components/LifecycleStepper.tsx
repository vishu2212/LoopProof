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
    <div className="stepper-container">
      <div className="stepper-disclaimer">
        <span className="stepper-disclaimer__dot" aria-hidden="true" />
        <span>
          <strong>Traceability Principle:</strong> Stages 01–03 record physical custody transfer.
          Stage 04 is a processor self-reported claim. Stage 05 is an independently audited outcome.
        </span>
      </div>

      <ol className="stepper" aria-label="Canonical lifecycle stages">
        {CANONICAL_STAGES.map((stage, i) => {
          let status: "done" | "current" | "upcoming" = "upcoming";
          if (!isAlternative) {
            if (i < currentIndex) status = "done";
            else if (i === currentIndex) status = "current";
          }
          const statusText =
            status === "done"
              ? "completed"
              : status === "current"
                ? "current stage"
                : "not reached";
          return (
            <li
              key={stage}
              className={`stepper__item stepper__item--${status}`}
              aria-current={status === "current" ? "step" : undefined}
            >
              <div className="stepper__marker-wrap">
                <span className="stepper__marker" aria-hidden="true">
                  {status === "done" ? (
                    <svg
                      width="13"
                      height="13"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : (
                    `0${i + 1}`
                  )}
                </span>
                {i < CANONICAL_STAGES.length - 1 ? (
                  <span className="stepper__connector" aria-hidden="true" />
                ) : null}
              </div>
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
        <h3 id="alt-outcomes-title">Alternative Lifecycle Outcomes</h3>
        <p className="muted">
          Non-happy-path branches separated from the five canonical progression stages.
        </p>
        <ul className="alt-outcomes__list">
          {ALTERNATIVE_OUTCOMES.map((o) => {
            const isThisBatch = o === current;
            return (
              <li
                key={o}
                className={`alt-outcomes__item alt-outcomes__item--${o.toLowerCase()} ${
                  isThisBatch ? "is-current" : ""
                }`}
              >
                <div className="alt-outcomes__item-header">
                  <strong>{STATE_LABEL[o]}</strong>
                  <code>{o}</code>
                  {isThisBatch ? (
                    <span className="alt-outcomes__badge">Current Batch Outcome</span>
                  ) : null}
                </div>
                <span className="muted alt-outcomes__meaning">{STATE_MEANING[o]}</span>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
