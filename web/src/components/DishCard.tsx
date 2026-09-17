import { Link } from "react-router-dom";
import { copy } from "../lib/copy";
import type { Dish } from "../lib/types";
import { Cover } from "./Cover";
import { Stars } from "./Stars";
import { WantEatButton } from "./WantEatButton";

export function DishCard({
  dish,
  onWantEat,
  busy,
}: {
  dish: Dish;
  onWantEat: (dish: Dish) => void;
  busy?: boolean;
}) {
  const to = `/dishes/${encodeURIComponent(dish.id)}`;
  return (
    <article className="overflow-hidden rounded-3xl bg-card shadow-card">
      <Link to={to} className="block">
        <Cover dish={dish} />
      </Link>
      <div className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-serif text-xl leading-snug text-ink">
              <Link to={to}>{dish.title}</Link>
            </h2>
            {dish.cookedAt ? (
              <p className="mt-1 text-sm text-mute">{dish.cookedAt}</p>
            ) : dish.status === "cooked" ? (
              <p className="mt-1 text-sm text-mute">{copy.cookedMark}</p>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {dish.categories.map((cat) => (
            <span key={cat.id} className="rounded-full bg-chip px-2.5 py-0.5 text-xs text-ink/80">
              {cat.name}
            </span>
          ))}
        </div>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm text-mute">
            {dish.ratingAvg != null ? (
              <>
                <Stars value={Math.round(dish.ratingAvg)} size="sm" />
                <span>
                  {dish.ratingAvg} {copy.rating.unit}
                </span>
              </>
            ) : (
              <span>{copy.rating.none}</span>
            )}
            {dish.wantEatCount > 0 ? <span>· {copy.wantEatCount(dish.wantEatCount)}</span> : null}
          </div>
        </div>
        <div className="flex items-center justify-between">
          <WantEatButton wanted={dish.wanted} count={dish.wantEatCount} busy={busy} onClick={() => onWantEat(dish)} />
          <Link to={to} className="text-sm font-medium text-clay">
            {copy.btn.detail}
          </Link>
        </div>
      </div>
    </article>
  );
}
