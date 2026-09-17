import { copy } from "../lib/copy";

export function WantEatButton({
  wanted,
  count,
  busy,
  onClick,
}: {
  wanted: boolean;
  count: number;
  busy?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={busy}
      onClick={onClick}
      className={
        wanted
          ? "inline-flex items-center gap-1 rounded-full bg-clay px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
          : "inline-flex items-center gap-1 rounded-full border border-clay/40 bg-card px-3 py-1.5 text-sm font-medium text-clay disabled:opacity-60"
      }
    >
      {wanted ? copy.btn.cancelWantEat : copy.btn.wantEat}
      {count > 0 ? <span className={wanted ? "text-white/80" : "text-mute"}>{count}</span> : null}
    </button>
  );
}
