/**
 * Browser origins allowed to call the API with credentials.
 * Same-origin Pages (pages.dev) is always allowed so production does not
 * depend on a hard-coded hostname if the project URL differs slightly.
 */
export const STATIC_ALLOWED_ORIGINS = [
  "https://averieh0202-maker.github.io",
  "https://averie-cook.pages.dev",
  "https://hehejojo-eat.pages.dev",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:4173",
  "http://127.0.0.1:4173",
  "http://localhost:8788",
  "http://127.0.0.1:8788",
] as const;

/** Preview deployments: https://<hash>.<project>.pages.dev */
export const PAGES_PREVIEW_ORIGIN =
  /^https:\/\/[a-z0-9-]+\.(averie-cook|hehejojo-eat)\.pages\.dev$/i;

export function isAllowedOrigin(origin: string, requestUrl?: string): boolean {
  const trimmed = origin.trim();
  if (!trimmed) return false;
  if ((STATIC_ALLOWED_ORIGINS as readonly string[]).includes(trimmed)) return true;
  if (PAGES_PREVIEW_ORIGIN.test(trimmed)) return true;
  if (requestUrl) {
    try {
      if (new URL(trimmed).origin === new URL(requestUrl).origin) return true;
    } catch {
      return false;
    }
  }
  return false;
}

/** Static + uploaded covers: prefer Pages host when the API is same-origin. */
export function resolveAssetBase(assetBaseUrl: string | undefined, requestUrl: string): string {
  const url = new URL(requestUrl);
  if (url.hostname.endsWith(".pages.dev")) return url.origin;
  return (assetBaseUrl || "https://averieh0202-maker.github.io/averie-cook").replace(/\/$/, "");
}
