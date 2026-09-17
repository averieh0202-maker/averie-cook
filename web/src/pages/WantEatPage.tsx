import { copy } from "../lib/copy";
import { DishListPage } from "./DishListPage";

export function WantEatPage() {
  return <DishListPage status="want_eat" empty={copy.empty.wantEat} />;
}
