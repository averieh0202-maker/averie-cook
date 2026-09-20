/** Fixed cuisine tags for 家食记 / 食物库 dishes. Extend only when Averie asks. */
export const HOME_CUISINE_TAGS = ["中餐", "西餐", "日料", "中东"] as const;
export type HomeCuisineTag = (typeof HOME_CUISINE_TAGS)[number];

const LEGACY_TO_HOME: Record<string, HomeCuisineTag> = {
  中餐: "中餐",
  中式: "中餐",
  chinese: "中餐",
  西餐: "西餐",
  意式: "西餐",
  italian: "西餐",
  西式: "西餐",
  日料: "日料",
  日式: "日料",
  japanese: "日料",
  中东: "中东",
  middleeast: "中东",
  "middle-east": "中东",
};

export function isHomeCuisineTag(value: string): value is HomeCuisineTag {
  return (HOME_CUISINE_TAGS as readonly string[]).includes(value);
}

/** Map legacy / freeform labels onto the fixed home cuisine set. */
export function normalizeHomeCuisineTags(input: string[]): HomeCuisineTag[] {
  const out: HomeCuisineTag[] = [];
  for (const raw of input) {
    const key = String(raw || "").trim();
    if (!key) continue;
    const mapped = LEGACY_TO_HOME[key] || LEGACY_TO_HOME[key.toLowerCase()];
    if (mapped && !out.includes(mapped)) out.push(mapped);
    else if (isHomeCuisineTag(key) && !out.includes(key)) out.push(key);
  }
  return out;
}
