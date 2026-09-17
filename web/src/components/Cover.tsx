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

export function Cover({ dish, className = "" }: { dish: Dish; className?: string }) {
  const [from, to] = paletteFor(dish.id);
  const initial = dish.title.slice(0, 1) || "菜";

  if (dish.coverUrl) {
    return (
      <div className={`relative aspect-square overflow-hidden bg-chip ${className}`}>
        <img
          src={dish.coverUrl}
          alt={dish.title}
          className="h-full w-full object-cover object-center"
        />
      </div>
    );
  }

  return (
    <div
      className={`relative aspect-square overflow-hidden ${className}`}
      style={{ background: `linear-gradient(145deg, ${from}, ${to})` }}
    >
      <div className="absolute inset-0 opacity-25" style={{ backgroundImage: "radial-gradient(circle at 30% 20%, white, transparent 45%)" }} />
      <span className="absolute inset-0 flex items-center justify-center font-serif text-6xl text-white/90 drop-shadow">
        {initial}
      </span>
    </div>
  );
}
