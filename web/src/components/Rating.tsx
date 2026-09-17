import { Link } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { copy } from "../lib/copy";
import { formatScore10 } from "../lib/format";

export function RatingMark({
  avg,
  count,
  size = "card",
}: {
  avg: number | null;
  count?: number;
  size?: "card" | "detail";
}) {
  const numCls = size === "detail" ? "text-[2rem]" : "text-[1.65rem]";
  return (
    <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
      <span className={`font-serif leading-none tabular-nums text-clay ${numCls}`}>{formatScore10(avg)}</span>
      <span className="text-sm text-mute">{copy.rating.unit}</span>
      {avg != null && count != null ? (
        <span className="text-sm text-mute">· {copy.rating.people(count)}</span>
      ) : avg == null ? (
        <span className="text-sm text-mute">{copy.rating.none}</span>
      ) : null}
    </div>
  );
}

export function RatingAccountHint() {
  const { rater, ready } = useAuth();
  if (!ready) return null;
  if (rater) {
    return <p className="text-xs text-mute">{copy.account.ratingAs(rater.displayName)}</p>;
  }
  return (
    <p className="text-xs text-mute">
      <Link to="/login" className="text-clay">
        {copy.btn.login}
      </Link>
      {" · "}
      {copy.account.nudge}
    </p>
  );
}

export function ScorePicker({
  value,
  onChange,
  disabled,
  compact,
}: {
  value: number | null;
  onChange?: (score: number) => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  const pad = compact ? "py-2 text-xs" : "py-2.5 text-sm";
  return (
    <div className="grid grid-cols-5 gap-2" role={onChange ? "radiogroup" : undefined} aria-label="评分 1 到 10">
      {Array.from({ length: 10 }, (_, i) => i + 1).map((score) => {
        const active = value === score;
        const filled = value != null && score <= value;
        if (!onChange) {
          return (
            <span
              key={score}
              className={`rounded-2xl ${pad} text-center font-medium tabular-nums ${
                filled ? "bg-clay text-white" : "bg-chip text-mute"
              }`}
            >
              {score}
            </span>
          );
        }
        return (
          <button
            key={score}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onChange(score);
            }}
            className={`rounded-2xl ${pad} font-medium tabular-nums transition disabled:opacity-60 ${
              active ? "bg-clay text-white shadow-sm" : "bg-chip text-ink/80 hover:bg-line"
            }`}
          >
            {score}
          </button>
        );
      })}
    </div>
  );
}
