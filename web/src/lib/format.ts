/** Format ISO date (YYYY-MM-DD) as a larger Chinese calendar line. */
export function formatCookedAt(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso.trim());
  if (!match) return iso;
  return `${match[1]}年${Number(match[2])}月${Number(match[3])}日`;
}

/** 10-point display, always one decimal so the scale is obvious. */
export function formatScore10(score: number | null | undefined): string {
  if (score == null || Number.isNaN(score)) return "—";
  return (Math.round(score * 10) / 10).toFixed(1);
}

export function dishMatchesQuery(title: string, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return title.toLowerCase().includes(q);
}
