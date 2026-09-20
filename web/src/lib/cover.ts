/** Cover files that ship with the Pages build (same origin as the SPA). */
export const PAGES_COVER_BY_DISH_ID: Record<string, string> = {
  "2026-09-14-chicken-pumpkin-risotto": "2026-09-14-chicken-pumpkin-risotto.jpg",
  "2026-09-15-porcini-risotto": "2026-09-15-porcini-risotto.jpg",
  "2026-09-16-beef-short-rib-rice": "2026-09-16-beef-short-rib-rice.jpg",
};

export const PAGES_COVER_FILES = new Set(Object.values(PAGES_COVER_BY_DISH_ID));

function assetBase(): string {
  const raw =
    typeof import.meta !== "undefined" && import.meta.env && typeof import.meta.env.BASE_URL === "string"
      ? import.meta.env.BASE_URL
      : "/";
  return raw.endsWith("/") ? raw : `${raw}/`;
}

export function pagesCoverUrl(filename: string): string {
  return `${assetBase()}covers/${encodeURIComponent(filename)}`;
}

export function isSafeCoverFilename(name: string): boolean {
  return /^[A-Za-z0-9._-]+\.(jpg|jpeg|png|webp|svg)$/i.test(name);
}

/** True for Cloudflare Worker media URLs that often fail or hang in mainland CN. */
export function isWorkerMediaUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return false;
  if (/workers\.dev/i.test(trimmed)) return true;
  if (/\/api\/media\//i.test(trimmed)) return true;
  return false;
}

export function filenameFromCoverUrl(coverUrl: string): string | null {
  const trimmed = coverUrl.trim();
  if (!trimmed) return null;
  const relative = trimmed.match(/^(?:\.?\/)?(?:covers|uploads)\/([^/?#]+)$/i);
  if (relative) {
    try {
      return decodeURIComponent(relative[1]);
    } catch {
      return relative[1];
    }
  }
  try {
    const path = new URL(coverUrl, "https://averieh0202-maker.github.io").pathname;
    const match = path.match(/\/(?:api\/media|covers|uploads)\/([^/]+)$/);
    return match ? decodeURIComponent(match[1]) : null;
  } catch {
    return null;
  }
}

export type CoverRef = {
  id?: string;
  coverUrl?: string | null;
};

/**
 * Always prefer GitHub Pages. Never return a workers.dev /api/media URL:
 * a hung image request on a blocked API host must not delay the card.
 */
export function resolveCoverUrl(coverUrlOrDish: string | null | undefined | CoverRef): string | null {
  const dish: CoverRef | null =
    typeof coverUrlOrDish === "object" && coverUrlOrDish !== null ? coverUrlOrDish : null;
  const coverUrl = typeof coverUrlOrDish === "string" ? coverUrlOrDish : (dish?.coverUrl ?? null);
  const dishId = dish?.id;

  if (dishId && PAGES_COVER_BY_DISH_ID[dishId]) {
    return pagesCoverUrl(PAGES_COVER_BY_DISH_ID[dishId]);
  }

  if (!coverUrl) return null;
  const filename = filenameFromCoverUrl(coverUrl);
  if (isWorkerMediaUrl(coverUrl)) {
    return filename && PAGES_COVER_FILES.has(filename) ? pagesCoverUrl(filename) : null;
  }
  if (filename && isSafeCoverFilename(filename)) return pagesCoverUrl(filename);
  return null;
}
