import { useCallback, useEffect, useState } from "react";
import { DishCard } from "../components/DishCard";
import { listDishes, toggleWantEat } from "../lib/api";
import { copy } from "../lib/copy";
import type { Dish } from "../lib/types";

export function DishListPage({
  status,
  empty,
}: {
  status: "cooked" | "want_cook" | "want_eat";
  empty: string;
}) {
  const [dishes, setDishes] = useState<Dish[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await listDishes(status);
      setDishes(res.dishes);
    } catch {
      setError(copy.loadError);
    }
  }, [status]);

  useEffect(() => {
    void load();
  }, [load]);

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
    } catch {
      setError(copy.loadError);
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
      <div className="space-y-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="animate-pulse overflow-hidden rounded-3xl bg-card">
            <div className="aspect-square bg-chip" />
            <div className="space-y-2 p-4">
              <div className="h-5 w-40 rounded bg-chip" />
              <div className="h-4 w-24 rounded bg-chip" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (dishes.length === 0) {
    return <p className="px-2 py-20 text-center leading-relaxed text-mute">{empty}</p>;
  }

  return (
    <div className="space-y-4">
      {error ? <p className="text-center text-sm text-clay">{error}</p> : null}
      {dishes.map((dish) => (
        <DishCard key={dish.id} dish={dish} busy={busyId === dish.id} onWantEat={onWantEat} />
      ))}
    </div>
  );
}
