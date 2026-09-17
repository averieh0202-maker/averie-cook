/** Cover filenames that ship with the Pages build (same origin as the SPA). */
export const PAGES_COVER_FILES = new Set(["2026-09-14-chicken-pumpkin-risotto.jpg"]);

function pagesCoverUrl(filename: string): string {
  const base = import.meta.env.BASE_URL.endsWith("/")
    ? import.meta.env.BASE_URL
    : `${import.meta.env.BASE_URL}/`;
  return `${base}covers/${encodeURIComponent(filename)}`;
}

export function filenameFromCoverUrl(coverUrl: string): string | null {
  try {
    const path = new URL(coverUrl, "https://averieh0202-maker.github.io").pathname;
    const match = path.match(/\/(?:api\/media|covers|uploads)\/([^/]+)$/);
    return match ? decodeURIComponent(match[1]) : null;
  } catch {
    return null;
  }
}

/**
 * Prefer GitHub Pages for known static covers so phones in CN do not wait on
 * workers.dev for the risotto photo. Other covers still use the API URL.
 */
export function resolveCoverUrl(coverUrl: string | null | undefined): string | null {
  if (!coverUrl) return null;
  const filename = filenameFromCoverUrl(coverUrl);
  if (filename && PAGES_COVER_FILES.has(filename)) return pagesCoverUrl(filename);
  return coverUrl;
}

export function workerCoverFallback(coverUrl: string | null | undefined): string | null {
  if (!coverUrl) return null;
  const resolved = resolveCoverUrl(coverUrl);
  return resolved && resolved !== coverUrl ? coverUrl : null;
}
