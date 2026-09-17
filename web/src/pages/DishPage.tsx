import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Cover } from "../components/Cover";
import { Stars } from "../components/Stars";
import { WantEatButton } from "../components/WantEatButton";
import { getDish, rateDish, toggleWantEat } from "../lib/api";
import { useAuth } from "../lib/auth";
import { copy } from "../lib/copy";
import type { Dish, Recipe } from "../lib/types";

function asStringList(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((x): x is string => typeof x === "string");
  if (typeof value === "string" && value.trim()) return [value];
  return [];
}

function RecipeBlock({ recipe }: { recipe: Recipe }) {
  const ingredients = asStringList(recipe.ingredients);
  const steps = asStringList(recipe.steps);
  const improvements = asStringList(recipe.improvements);
  return (
    <section className="space-y-5 rounded-3xl bg-card p-4 shadow-card">
      {recipe.summary ? (
        <div>
          <h2 className="mb-1 text-sm font-medium text-mute">笔记</h2>
          <p className="leading-relaxed">{recipe.summary}</p>
        </div>
      ) : null}
      {ingredients.length ? (
        <div>
          <h2 className="mb-2 text-sm font-medium text-mute">用料</h2>
          <ul className="list-disc space-y-1 pl-5">
            {ingredients.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {recipe.ingredients_v1 ? (
        <div>
          <h2 className="mb-1 text-sm font-medium text-mute">用料 · 第一版</h2>
          <p>{String(recipe.ingredients_v1)}</p>
        </div>
      ) : null}
      {recipe.ingredients_v2_next ? (
        <div>
          <h2 className="mb-1 text-sm font-medium text-mute">用料 · 下次</h2>
          <p>{String(recipe.ingredients_v2_next)}</p>
        </div>
      ) : null}
      {steps.length ? (
        <div>
          <h2 className="mb-2 text-sm font-medium text-mute">步骤</h2>
          <ol className="list-decimal space-y-2 pl-5">
            {steps.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ol>
        </div>
      ) : null}
      {recipe.tasting ? (
        <div>
          <h2 className="mb-1 text-sm font-medium text-mute">品尝</h2>
          <p>{String(recipe.tasting)}</p>
        </div>
      ) : null}
      {improvements.length ? (
        <div>
          <h2 className="mb-2 text-sm font-medium text-mute">下次改进</h2>
          <ul className="list-disc space-y-1 pl-5">
            {improvements.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

export function DishPage() {
  const { id = "" } = useParams();
  const { owner } = useAuth();
  const [dish, setDish] = useState<Dish | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setDish(null);
    setError(null);
    void getDish(id)
      .then((res) => {
        if (!cancelled) setDish(res.dish);
      })
      .catch(() => {
        if (!cancelled) setError(copy.loadError);
      });
    return () => {
      cancelled = true;
    };
  }, [id, owner]);

  async function onRate(score: number) {
    if (!dish) return;
    setBusy(true);
    try {
      const res = await rateDish(dish.id, score);
      setDish({ ...dish, myScore: res.myScore, ratingAvg: res.ratingAvg, ratingCount: res.ratingCount });
    } catch {
      setError(copy.loadError);
    } finally {
      setBusy(false);
    }
  }

  async function onWantEat() {
    if (!dish) return;
    setBusy(true);
    try {
      const res = await toggleWantEat(dish.id);
      setDish({ ...dish, wanted: res.wanted, wantEatCount: res.wantEatCount });
    } catch {
      setError(copy.loadError);
    } finally {
      setBusy(false);
    }
  }

  if (error && !dish) {
    return (
      <div className="py-16 text-center text-mute">
        <p>{error}</p>
        <Link to="/" className="mt-3 inline-block text-clay">
          {copy.btn.back}
        </Link>
      </div>
    );
  }

  if (!dish) {
    return (
      <div className="animate-pulse overflow-hidden rounded-3xl bg-card">
        <div className="aspect-square bg-chip" />
        <div className="space-y-2 p-4">
          <div className="h-6 w-48 rounded bg-chip" />
          <div className="h-4 w-32 rounded bg-chip" />
        </div>
      </div>
    );
  }

  const hasRecipe = Boolean(dish.recipe && Object.keys(dish.recipe).length);

  return (
    <div className="space-y-4">
      <Link to="/" className="text-sm text-mute">
        ← {copy.btn.back}
      </Link>
      <div className="overflow-hidden rounded-3xl bg-card shadow-card">
        <Cover dish={dish} />
        <div className="space-y-3 p-4">
          <h1 className="font-serif text-2xl text-ink">{dish.title}</h1>
          <div className="flex flex-wrap gap-1.5">
            <span className="rounded-full bg-olive/15 px-2.5 py-0.5 text-xs text-olive">
              {dish.status === "cooked" ? copy.cookedMark : copy.nav.wantCook}
            </span>
            {dish.categories.map((cat) => (
              <span key={cat.id} className="rounded-full bg-chip px-2.5 py-0.5 text-xs text-ink/80">
                {cat.name}
              </span>
            ))}
          </div>
          {dish.cookedAt ? <p className="text-sm text-mute">{dish.cookedAt}</p> : null}
          <div className="flex items-center gap-2 text-sm text-mute">
            {dish.ratingAvg != null ? (
              <span>
                {dish.ratingAvg} {copy.rating.unit} · {dish.ratingCount} 人评
              </span>
            ) : (
              <span>{copy.rating.none}</span>
            )}
            {dish.wantEatCount > 0 ? <span>· {copy.wantEatCount(dish.wantEatCount)}</span> : null}
          </div>
        </div>
      </div>

      <section className="space-y-3 rounded-3xl bg-card p-4 shadow-card">
        <h2 className="text-sm font-medium text-mute">{copy.rating.title}</h2>
        <Stars value={dish.myScore} onChange={(score) => void onRate(score)} />
        <p className="text-sm text-mute">{dish.myScore ? copy.btn.rerate : copy.btn.rate}</p>
        <WantEatButton wanted={dish.wanted} count={dish.wantEatCount} busy={busy} onClick={() => void onWantEat()} />
      </section>

      {hasRecipe ? (
        <RecipeBlock recipe={dish.recipe as Recipe} />
      ) : (
        <section className="rounded-3xl border border-dashed border-line bg-card/60 p-5 text-center">
          <p className="font-medium text-ink">{copy.lock.title}</p>
          <p className="mt-2 text-sm leading-relaxed text-mute">{copy.lock.sub}</p>
          <Link to="/login" className="mt-4 inline-block text-sm text-clay">
            {copy.btn.login}
          </Link>
        </section>
      )}
    </div>
  );
}
