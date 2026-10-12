"use client";

/** fetch JSON with uniform errors: the server sends { error } and that message is what the user sees. */
export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { "content-type": "application/json", ...init?.headers } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
  return body as T;
}

export type Portfolio = {
  mode: "paper" | "live";
  value: number;
  upnl: number;
  realized: number;
  cash: number | null;
  positions: { tokenId: string; title: string; outcome: string; slug: string; shares: number; avgPrice: number; price: number; value: number; upnl: number }[];
};

export type CopyEvent = {
  id: number;
  runId: string;
  name: "buyOutcome" | "sellOutcome";
  input?: unknown;
  output?: unknown;
  ok: boolean;
  ts: number;
};
