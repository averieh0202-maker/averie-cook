import type { Category } from "./types";

/** Display aliases mapped from existing category ids (西餐/中餐). */
const CUISINE_LABELS: Record<string, string> = {
  italian: "西餐",
  chinese: "中餐",
};

export function categoryLabel(cat: Pick<Category, "id" | "name">): string {
  return CUISINE_LABELS[cat.id] ?? cat.name;
}

export function dishHasCategory(categoryIds: string[], categoryId: string): boolean {
  if (categoryId === "all") return true;
  return categoryIds.includes(categoryId);
}
