/** Deterministic UTC formatting (avoids server/client locale hydration mismatches). */
export function formatUtc(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())} UTC`;
}

export function formatGrams(g: number): string {
  return g > 0 ? `${g.toLocaleString("en-US")} g` : "—";
}
