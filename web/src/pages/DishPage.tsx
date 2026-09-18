import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Cover } from "../components/Cover";
import { RatingAccountHint, RatingMark, ScorePicker } from "../components/Rating";
import { WantEatButton } from "../components/WantEatButton";
import { ApiError, getDish, isUnreachableError, rateDish, toggleWantEat } from "../lib/api";
import { useAuth } from "../lib/auth";
import { categoryLabel } from "../lib/categories";
import { copy } from "../lib/copy";
import { formatCookedAt } from "../lib/format";
import { findSnapshotDish, getCachedCatalog, loadCatalogSnapshot, overlayLiveDish } from "../lib/snapshot";
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
    <section className="space-y-5 rounded-[1.7rem] bg-card p-5 shadow-card">
      {recipe.summary ? (
        <div>
          <h2 className="mb-1.5 text-sm font-medium tracking-wide text-mute">笔记</h2>
          <p className="leading-relaxed">{recipe.summary}</p>
        </div>
      ) : null}
      {ingredients.length ? (
        <div>
          <h2 className="mb-2 text-sm font-medium tracking-wide text-mute">用料</h2>
          <ul className="list-disc space-y-1 pl-5">
            {ingredients.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {recipe.ingredients_v1 ? (
        <div>
          <h2 className="mb-1.5 text-sm font-medium tracking-wide text-mute">用料 · 第一版</h2>
          <p>{String(recipe.ingredients_v1)}</p>
        </div>
      ) : null}
      {recipe.ingredients_v2_next ? (
        <div>
          <h2 className="mb-1.5 text-sm font-medium tracking-wide text-mute">用料 · 下次</h2>
          <p>{String(recipe.ingredients_v2_next)}</p>
        </div>
      ) : null}
      {steps.length ? (
        <div>
          <h2 className="mb-2 text-sm font-medium tracking-wide text-mute">步骤</h2>
          <ol className="list-decimal space-y-2 pl-5">
            {steps.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ol>
        </div>
      ) : null}
      {recipe.tasting ? (
        <div>
          <h2 className="mb-1.5 text-sm font-medium tracking-wide text-mute">品尝</h2>
          <p>{String(recipe.tasting)}</p>
        </div>
      ) : null}
      {improvements.length ? (
        <div>
          <h2 className="mb-2 text-sm font-medium tracking-wide text-mute">下次改进</h2>
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

function failMessage(err: unknown): string {
  if (isUnreachableError(err)) return copy.offlineRatings;
  return err instanceof ApiError && err.message === "slow" ? copy.slowError : copy.loadError;
}

export function DishPage() {
  const { id = "" } = useParams();
  const { owner, identityEpoch } = useAuth();
  const [dish, setDish] = useState<Dish | null>(() => {
    const snap = getCachedCatalog();
    return snap ? findSnapshotDish(snap.dishes, id) ?? null : null;
  });
  const [asOwner, setAsOwner] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (signal?: AbortSignal) => {
    setError(null);
    let snapshotDish: Dish | undefined;
    try {
      const snap = getCachedCatalog() ?? (await loadCatalogSnapshot());
      if (signal?.aborted) return;
      snapshotDish = findSnapshotDish(snap.dishes, id);
      if (snapshotDish) {
        const fromSnap = snapshotDish;
        setDish((prev) => (prev?.id === id ? prev : fromSnap));
      }
    } catch {
      // Live API may still succeed.
    }

    try {
      const res = await getDish(id, { signal });
      if (signal?.aborted) return;
      setDish(overlayLiveDish(snapshotDish, res.dish));
      setAsOwner(res.owner);
      setError(null);
    } catch (err) {
      if (signal?.aborted) return;
      if (snapshotDish) {
        setDish(snapshotDish);
        setError(copy.offlineRatings);
      } else {
        setError(failMessage(err));
      }
    }
  }, [id, owner, identityEpoch]);

  useEffect(() => {
    setAsOwner(false);
    const snap = getCachedCatalog();
    const fromSnap = snap ? findSnapshotDish(snap.dishes, id) : undefined;
    setDish(fromSnap ?? null);
    const ctrl = new AbortController();
    void load(ctrl.signal);
    return () => ctrl.abort();
  }, [id, load]);

  async function onRate(score: number) {
    if (!dish) return;
    setBusy(true);
    try {
      const res = await rateDish(dish.id, score);
      setDish({ ...dish, myScore: res.myScore, ratingAvg: res.ratingAvg, ratingCount: res.ratingCount });
      setError(null);
    } catch (err) {
      setError(failMessage(err));
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
      setError(null);
    } catch (err) {
      setError(failMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (error && !dish) {
    return (
      <div className="py-16 text-center text-mute">
        <p>{error}</p>
        <button type="button" className="mt-3 text-clay" onClick={() => void load()}>
          {copy.btn.retry}
        </button>
        <Link to="/" className="mt-3 block text-sm text-mute">
          {copy.btn.back}
        </Link>
      </div>
    );
  }

  if (!dish) {
    return (
      <div className="animate-pulse overflow-hidden rounded-[1.7rem] bg-card">
        <div className="aspect-square bg-chip" />
        <div className="space-y-2 p-4">
          <div className="h-6 w-48 rounded bg-chip" />
          <div className="h-4 w-32 rounded bg-chip" />
        </div>
      </div>
    );
  }

  const hasRecipe = Boolean(dish.recipe && Object.keys(dish.recipe).length);
  const showAsOwner = asOwner || owner;

  return (
    <div className="space-y-4">
      <Link to="/" className="text-sm tracking-wide text-mute">
        ← {copy.btn.back}
      </Link>
      <div className="overflow-hidden rounded-[1.7rem] bg-card shadow-card">
        <Cover dish={dish} priority />
        <div className="space-y-3.5 p-5">
          <h1 className="font-serif text-[1.7rem] leading-snug tracking-wide text-ink">{dish.title}</h1>
          {dish.cookedAt ? (
            <p className="font-serif text-xl leading-none tracking-wide text-ink/75">{formatCookedAt(dish.cookedAt)}</p>
          ) : null}
          <div className="flex flex-wrap gap-1.5">
            <span className="rounded-full bg-olive/15 px-2.5 py-0.5 text-xs tracking-wide text-olive">
              {dish.status === "cooked" ? copy.cookedMark : copy.nav.wantCook}
            </span>
            {dish.categories.map((cat) => (
              <span key={cat.id} className="rounded-full bg-chip px-2.5 py-0.5 text-xs tracking-wide text-ink/80">
                {categoryLabel(cat)}
              </span>
            ))}
          </div>
          <RatingMark avg={dish.ratingAvg} count={dish.ratingCount} size="detail" />
          {dish.wantEatCount > 0 ? <p className="text-sm text-mute">{copy.wantEatCount(dish.wantEatCount)}</p> : null}
        </div>
      </div>

      {error ? (
        <div className="rounded-2xl bg-chip px-3 py-2 text-center text-sm text-clay">
          <p>{error}</p>
          <button type="button" className="mt-1 font-medium" onClick={() => void load()}>
            {copy.btn.retry}
          </button>
        </div>
      ) : null}

      <section className="space-y-3 rounded-[1.7rem] bg-card p-5 shadow-card">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-sm font-medium tracking-wide text-mute">{copy.rating.title}</h2>
          <span className="text-xs text-mute">{copy.rating.scale}</span>
        </div>
        <ScorePicker value={dish.myScore} disabled={busy} onChange={(score) => void onRate(score)} />
        <p className="text-sm text-mute">{dish.myScore ? copy.rating.yours(dish.myScore) : copy.rating.pick}</p>
        <RatingAccountHint />
        <WantEatButton wanted={dish.wanted} count={dish.wantEatCount} busy={busy} onClick={() => void onWantEat()} />
      </section>

      {hasRecipe ? (
        <RecipeBlock recipe={dish.recipe as Recipe} />
      ) : showAsOwner ? (
        <section className="rounded-[1.7rem] border border-dashed border-line bg-card/60 p-5 text-center">
          <p className="text-mute">{copy.ownerNoRecipe}</p>
        </section>
      ) : (
        <section className="rounded-[1.7rem] border border-dashed border-line bg-card/60 p-5 text-center">
          <p className="font-medium text-ink">{copy.lock.title}</p>
          <p className="mt-2 text-sm leading-relaxed text-mute">{copy.lock.sub}</p>
          <Link to="/login" className="mt-4 inline-block text-sm text-clay">
            {copy.btn.loginOwner}
          </Link>
        </section>
      )}
    </div>
  );
}
