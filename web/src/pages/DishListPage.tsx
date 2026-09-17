import { useCallback, useEffect, useMemo, useState } from "react";
import { DishCard } from "../components/DishCard";
import { RatingAccountHint } from "../components/Rating";
import { ApiError, listCategories, listDishes, rateDish, toggleWantEat } from "../lib/api";
import { categoryLabel, dishHasCategory } from "../lib/categories";
import { copy } from "../lib/copy";
import { dishMatchesQuery } from "../lib/format";
import { useAuth } from "../lib/auth";
import type { Category, Dish } from "../lib/types";

export function DishListPage({
  status,
  empty,
}: {
  status: "cooked" | "want_cook" | "want_eat";
  empty: string;
}) {
  const { identityEpoch } = useAuth();
  const [dishes, setDishes] = useState<Dish[] | null>(null);
  const [catalog, setCatalog] = useState<Category[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState("all");
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    setError(null);
    try {
      const [dishRes, catRes] = await Promise.all([
        listDishes(status),
        listCategories().catch(() => ({ categories: [] as Category[] })),
      ]);
      setDishes(dishRes.dishes);
      setCatalog(catRes.categories);
    } catch (err) {
      setError(err instanceof ApiError && err.message === "slow" ? copy.slowError : copy.loadError);
    }
  }, [status, identityEpoch]);

  useEffect(() => {
    setCategoryId("all");
    setQuery("");
    setDishes(null);
    void load();
  }, [load]);

  const filters = useMemo(() => {
    if (catalog.length) return catalog;
    const seen = new Map<string, Category>();
    for (const dish of dishes || []) {
      for (const cat of dish.categories) seen.set(cat.id, cat);
    }
    return [...seen.values()].sort((a, b) => a.sort - b.sort);
  }, [catalog, dishes]);

  const visible = useMemo(() => {
    if (!dishes) return [];
    return dishes.filter(
      (dish) =>
        dishHasCategory(
          dish.categories.map((c) => c.id),
          categoryId,
        ) && dishMatchesQuery(dish.title, query),
    );
  }, [dishes, categoryId, query]);

  async function onWantEat(dish: Dish) {
    setBusyId(dish.id);
    try {
      const res = await toggleWantEat(dish.id);
      setDishes((prev) => {
        if (!prev) return prev;
        const next = prev.map((d) =>
          d.id === dish.id ? { ...d, wanted: res.wanted, wantEatCount: res.wantEatCount } : d,
        );
        if (status === "want_eat") return next.filter((d) => d.wantEatCount > 0);
        return next;
      });
    } catch (err) {
      setError(err instanceof ApiError && err.message === "slow" ? copy.slowError : copy.loadError);
    } finally {
      setBusyId(null);
    }
  }

  async function onRate(dish: Dish, score: number) {
    setBusyId(dish.id);
    try {
      const res = await rateDish(dish.id, score);
      setDishes((prev) => {
        if (!prev) return prev;
        return prev.map((d) =>
          d.id === dish.id
            ? { ...d, myScore: res.myScore, ratingAvg: res.ratingAvg, ratingCount: res.ratingCount }
            : d,
        );
      });
    } catch (err) {
      setError(err instanceof ApiError && err.message === "slow" ? copy.slowError : copy.loadError);
    } finally {
      setBusyId(null);
    }
  }

  if (error && !dishes) {
    return (
      <div className="py-16 text-center text-mute">
        <p>{error}</p>
        <button type="button" className="mt-3 text-clay" onClick={() => void load()}>
          {copy.btn.retry}
        </button>
      </div>
    );
  }

  if (!dishes) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="列表载入中">
        {[0, 1, 2].map((i) => (
          <div key={i} className="animate-pulse overflow-hidden rounded-[1.7rem] bg-card">
            <div className="aspect-square bg-chip" />
            <div className="space-y-2 p-4">
              <div className="h-5 w-40 rounded bg-chip" />
              <div className="h-4 w-24 rounded bg-chip" />
              <div className="grid grid-cols-5 gap-2 pt-2">
                {Array.from({ length: 10 }, (_, n) => (
                  <div key={n} className="h-8 rounded-2xl bg-chip" />
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <RatingAccountHint />
      <label className="block">
        <span className="sr-only">{copy.searchPlaceholder}</span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={copy.searchPlaceholder}
          className="w-full rounded-2xl border border-line/80 bg-card px-4 py-2.5 text-[15px] text-ink outline-none ring-clay placeholder:text-mute/80 focus:ring-2"
        />
      </label>

      {error ? (
        <div className="rounded-2xl bg-chip px-3 py-2 text-center text-sm text-clay">
          <p>{error}</p>
          <button type="button" className="mt-1 font-medium" onClick={() => void load()}>
            {copy.btn.retry}
          </button>
        </div>
      ) : null}

      <div className="flex items-start gap-3">
        <nav
          className="sticky top-[4.35rem] w-[3.85rem] shrink-0 self-start"
          aria-label={copy.categoriesNav}
        >
          <ul className="space-y-1">
            <li>
              <CategoryButton
                label={copy.allCategories}
                active={categoryId === "all"}
                onClick={() => setCategoryId("all")}
              />
            </li>
            {filters.map((cat) => (
              <li key={cat.id}>
                <CategoryButton
                  label={categoryLabel(cat)}
                  active={categoryId === cat.id}
                  onClick={() => setCategoryId(cat.id)}
                />
              </li>
            ))}
          </ul>
        </nav>

        <div className="min-w-0 flex-1 space-y-5">
          {dishes.length === 0 ? (
            <p className="px-1 py-16 text-center leading-relaxed text-mute">{empty}</p>
          ) : visible.length === 0 ? (
            <p className="px-1 py-16 text-center leading-relaxed text-mute">{copy.noMatch}</p>
          ) : (
            visible.map((dish, index) => (
              <DishCard
                key={dish.id}
                dish={dish}
                busy={busyId === dish.id}
                priority={index === 0}
                onWantEat={onWantEat}
                onRate={onRate}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function CategoryButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`w-full rounded-2xl px-1 py-2 text-[13px] leading-tight tracking-wide transition ${
        active ? "bg-clay font-medium text-white shadow-sm" : "bg-transparent text-mute hover:bg-chip hover:text-ink"
      }`}
    >
      {label}
    </button>
  );
}
