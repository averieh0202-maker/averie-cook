import { useEffect, useState } from "react";
import { resolveCoverUrl, workerCoverFallback } from "../lib/cover";
import { copy } from "../lib/copy";
import type { Dish } from "../lib/types";

const PALETTES = [
  ["#c45c26", "#e8b86d"],
  ["#6b7c5a", "#c5d4b0"],
  ["#7a4e3a", "#d4a574"],
  ["#4f6d7a", "#b7cdd6"],
  ["#8a5a72", "#e0bfc9"],
];

function paletteFor(id: string): [string, string] {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  const pair = PALETTES[Math.abs(hash) % PALETTES.length];
  return [pair[0], pair[1]];
}

function Placeholder({
  from,
  to,
  initial,
  className,
}: {
  from: string;
  to: string;
  initial: string;
  className: string;
}) {
  return (
    <div
      className={`overflow-hidden ${className}`}
      style={{ background: `linear-gradient(145deg, ${from}, ${to})` }}
    >
      <div
        className="absolute inset-0 opacity-25"
        style={{ backgroundImage: "radial-gradient(circle at 30% 20%, white, transparent 45%)" }}
      />
      <span className="absolute inset-0 flex items-center justify-center font-serif text-6xl text-white/90 drop-shadow">
        {initial}
      </span>
    </div>
  );
}

export function Cover({
  dish,
  className = "",
  priority = false,
}: {
  dish: Dish;
  className?: string;
  priority?: boolean;
}) {
  const [from, to] = paletteFor(dish.id);
  const initial = dish.title.slice(0, 1) || "菜";
  const primary = resolveCoverUrl(dish.coverUrl);
  const fallback = workerCoverFallback(dish.coverUrl);
  const [src, setSrc] = useState<string | null>(primary);
  const [failed, setFailed] = useState(!primary);

  useEffect(() => {
    const next = resolveCoverUrl(dish.coverUrl);
    setSrc(next);
    setFailed(!next);
  }, [dish.coverUrl]);

  if (!src || failed) {
    return (
      <Placeholder from={from} to={to} initial={initial} className={`relative aspect-square ${className}`} />
    );
  }

  return (
    <div className={`relative aspect-square overflow-hidden bg-chip ${className}`}>
      <Placeholder from={from} to={to} initial={initial} className="absolute inset-0" />
      <img
        src={src}
        alt={dish.title}
        width={800}
        height={800}
        loading={priority ? "eager" : "lazy"}
        decoding="async"
        fetchPriority={priority ? "high" : "low"}
        sizes="(max-width: 32rem) 100vw, 32rem"
        className="relative z-[1] h-full w-full object-cover object-center"
        onError={() => {
          if (fallback && src !== fallback) {
            setSrc(fallback);
            return;
          }
          setFailed(true);
        }}
      />
      <span className="sr-only">{copy.coverLoading}</span>
    </div>
  );
}
