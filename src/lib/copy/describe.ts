/** One-line summary of a copy-bot event, shared by the feed, toasts and Telegram alerts. */
type Described = { name: string; ok: boolean; input?: unknown; output?: unknown };

export function describeCopy(e: Described) {
  const o = (e.output ?? {}) as { status?: string; outcome?: string; title?: string; usd?: number; message?: string; error?: string; execMs?: number };
  const i = (e.input ?? {}) as { reason?: string };
  const buy = e.name === "buyOutcome";
  const who = i.reason ? ` (${i.reason})` : "";
  if (!e.ok) return `${buy ? "Buy" : "Sell"} failed${who}: ${o.error ?? "error"}`;
  if (o.status === "skipped") return `Skipped${who}: ${o.message ?? ""}`;
  const speed = o.execMs !== undefined ? ` in ${o.execMs} ms` : "";
  return `${buy ? "Bought" : "Sold"} ${o.outcome ?? ""} for $${(o.usd ?? 0).toFixed(2)}${speed} on ${o.title ?? "a market"}${who}`;
}
