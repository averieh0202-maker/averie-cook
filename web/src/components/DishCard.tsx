import { Link } from "react-router-dom";
import { categoryLabel } from "../lib/categories";
import { copy } from "../lib/copy";
import { formatCookedAt } from "../lib/format";
import type { Dish } from "../lib/types";
import { Cover } from "./Cover";
import { RatingMark, ScorePicker } from "./Rating";
import { WantEatButton } from "./WantEatButton";

export function DishCard({
  dish,
  onWantEat,
  onRate,
  busy,
  priority,
}: {
  dish: Dish;
  onWantEat: (dish: Dish) => void;
  onRate: (dish: Dish, score: number) => void;
  busy?: boolean;
  priority?: boolean;
}) {
  const to = `/dishes/${encodeURIComponent(dish.id)}`;
  return (
    <article className="overflow-hidden rounded-[1.7rem] bg-card shadow-card">
      <Link to={to} className="block">
        <Cover dish={dish} priority={priority} />
      </Link>
      <div className="space-y-3.5 px-4 pb-4 pt-3.5">
        <div>
          <h2 className="font-serif text-[1.35rem] leading-snug tracking-wide text-ink">
            <Link to={to}>{dish.title}</Link>
          </h2>
          {dish.cookedAt ? (
            <p className="mt-2 font-serif text-lg leading-none tracking-wide text-ink/75">
              {formatCookedAt(dish.cookedAt)}
            </p>
          ) : dish.status === "cooked" ? (
            <p className="mt-2 text-base text-mute">{copy.cookedMark}</p>
          ) : null}
        </div>
        <div className="space-y-2.5">
          <RatingMark avg={dish.ratingAvg} count={dish.ratingCount} />
          <ScorePicker
            value={dish.myScore}
            disabled={busy}
            compact
            onChange={(score) => onRate(dish, score)}
          />
          <p className="text-sm text-mute">
            {dish.myScore ? copy.rating.yours(dish.myScore) : copy.rating.pick}
          </p>
        </div>
        {dish.categories.length ? (
          <div className="flex flex-wrap gap-1.5">
            {dish.categories.map((cat) => (
              <span key={cat.id} className="rounded-full bg-chip px-2.5 py-0.5 text-xs tracking-wide text-ink/75">
                {categoryLabel(cat)}
              </span>
            ))}
          </div>
        ) : null}
        {dish.wantEatCount > 0 ? <p className="text-sm text-mute">{copy.wantEatCount(dish.wantEatCount)}</p> : null}
        <div className="flex items-center justify-between pt-0.5">
          <WantEatButton wanted={dish.wanted} count={dish.wantEatCount} busy={busy} onClick={() => onWantEat(dish)} />
          <Link to={to} className="text-sm font-medium tracking-wide text-clay">
            {copy.btn.detail}
          </Link>
        </div>
      </div>
    </article>
  );
}
