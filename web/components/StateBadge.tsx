import type { BatchState } from "@/lib/lifecycle";
import { STATE_LABEL } from "@/lib/lifecycle";

type Props = { state: Exclude<BatchState, "NONE"> };

const TONE: Record<Props["state"], string> = {
  REGISTERED: "neutral",
  COLLECTED: "progress",
  RECEIVED: "progress",
  PROCESSED_CLAIMED: "claim",
  VERIFIED: "ok",
  RETURNED: "warn",
  REJECTED: "bad",
  CANCELLED: "muted",
};

/** Color is never the only signal: the state name is always printed as text. */
export function StateBadge({ state }: Props) {
  return (
    <span className={`badge badge--${TONE[state]}`}>
      <span className="badge__code">{state}</span>
      <span className="visually-hidden"> — </span>
      <span className="badge__label">{STATE_LABEL[state]}</span>
    </span>
  );
}
