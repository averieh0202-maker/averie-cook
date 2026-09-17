import { copy } from "../lib/copy";
import { DishListPage } from "./DishListPage";

export function CookedPage() {
  return <DishListPage status="cooked" empty={copy.empty.cooked} />;
}
