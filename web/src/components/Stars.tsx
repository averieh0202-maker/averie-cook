export function Stars({
  value,
  onChange,
  size = "md",
}: {
  value: number | null;
  onChange?: (score: number) => void;
  size?: "sm" | "md";
}) {
  const n = value ?? 0;
  const cls = size === "sm" ? "text-lg" : "text-2xl";
  return (
    <div className="flex items-center gap-1" role={onChange ? "radiogroup" : undefined} aria-label="评分">
      {[1, 2, 3, 4, 5].map((score) => {
        const filled = score <= n;
        if (!onChange) {
          return (
            <span key={score} className={`${cls} ${filled ? "text-clay" : "text-line"}`}>
              ★
            </span>
          );
        }
        return (
          <button
            key={score}
            type="button"
            role="radio"
            aria-checked={score === n}
            onClick={() => onChange(score)}
            className={`${cls} leading-none transition ${filled ? "text-clay" : "text-line hover:text-clay/70"}`}
          >
            ★
          </button>
        );
      })}
    </div>
  );
}
