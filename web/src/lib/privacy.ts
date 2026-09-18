/** Keys that must never appear on anonymous dish JSON or the Pages snapshot. */
export const PRIVATE_JSON_TOKENS = [
  "recipe",
  "notes",
  "calories",
  "ingredients",
  "ingredients_v1",
  "ingredients_v2_next",
  "steps",
  "tasting",
  "improvements",
  "summary",
  "cover_path",
  "coverPath",
] as const;

export const PUBLIC_DISH_KEYS = [
  "id",
  "title",
  "status",
  "categories",
  "coverUrl",
  "cookedAt",
  "sourceUrl",
  "sourceType",
  "ratingAvg",
  "ratingCount",
  "wantEatCount",
  "myScore",
  "wanted",
  "published",
  "createdAt",
  "updatedAt",
] as const;

export function jsonContainsPrivateTokens(payload: unknown): string[] {
  const raw = JSON.stringify(payload);
  return PRIVATE_JSON_TOKENS.filter((token) => {
    const re = new RegExp(`"${token}"\\s*:`);
    return re.test(raw);
  });
}

export function assertPublicPayload(payload: unknown): void {
  const hits = jsonContainsPrivateTokens(payload);
  if (hits.length) {
    throw new Error(`public payload leaked private keys: ${hits.join(", ")}`);
  }
}
