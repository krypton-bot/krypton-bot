const cache = new Map<string, Intl.NumberFormat>();
function nf(min: number, max: number, compact = false) {
  const key = `${min}-${max}-${compact}`;
  let f = cache.get(key);
  if (!f) {
    f = new Intl.NumberFormat("en-US", {
      minimumFractionDigits: min,
      maximumFractionDigits: max,
      notation: compact ? "compact" : "standard",
    });
    cache.set(key, f);
  }
  return f;
}

export const fmt = (n: number | undefined, d = 2) => (n === undefined || Number.isNaN(n) ? "—" : nf(d, d).format(n));
export const fmtUsd = (n: number | undefined, d = 2) => {
  if (n === undefined || Number.isNaN(n)) return "—";
  const v = nf(d, d).format(Math.abs(n));
  return n < 0 && +v.replace(/,/g, "") !== 0 ? `-$${v}` : `$${v}`;
};
export const fmtCompact = (n: number | undefined) =>
  n === undefined || Number.isNaN(n) ? "—" : `$${nf(0, 1, true).format(n)}`;
/** Compact count without a currency sign: 1.2K, 3.4M. */
export const fmtCount = (n: number | undefined) => (n === undefined || Number.isNaN(n) ? "—" : nf(0, 1, true).format(n));
export const fmtPct = (n: number | undefined, d = 2) =>
  n === undefined || Number.isNaN(n) ? "—" : `${n >= 0 ? "+" : ""}${nf(d, d).format(n)}%`;

/** Decimals for a price: instrument price_decimals, else derived from magnitude. */
export const priceDecimals = (p: number, hint?: number) =>
  hint ?? (p >= 1000 ? 1 : p >= 1 ? 3 : p >= 0.01 ? 5 : 7);

export function countdown(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}:${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}
