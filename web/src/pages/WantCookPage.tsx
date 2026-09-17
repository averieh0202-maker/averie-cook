import { copy } from "../lib/copy";
import { DishListPage } from "./DishListPage";

export function WantCookPage() {
  return <DishListPage status="want_cook" empty={copy.empty.wantCook} />;
}
