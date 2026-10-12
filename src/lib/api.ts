import "server-only";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { ready } from "@/db";
import { RiskError } from "@/lib/trading";
import { PmLiveError } from "@/lib/trading/pm-live";

const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;
const extraHosts = new Set((process.env.ALLOWED_HOSTS ?? "").split(",").map((h) => h.trim().toLowerCase()).filter(Boolean));

/**
 * This app has no login, so it must only answer to the machine it runs on. Refusing unknown Host headers blocks
 * DNS-rebinding attacks from web pages; the Origin check blocks cross-site writes. Set ALLOWED_HOSTS to add a
 * hostname (for example behind your own reverse proxy with auth).
 */
export function hostAllowed(req: Request) {
  const host = (req.headers.get("host") ?? "").toLowerCase();
  return LOCAL_HOST.test(host) || extraHosts.has(host);
}

export function sameOrigin(req: Request) {
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") return true;
  const origin = req.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === req.headers.get("host");
  } catch {
    return false;
  }
}

/** Only our own thrown messages reach the client; database, network and runtime errors stay in the server log. */
const INTERNAL = [TypeError, RangeError, ReferenceError, SyntaxError];
export const safeMessage = (e: unknown) =>
  e instanceof Error && !("code" in e) && !INTERNAL.some((T) => e instanceof T) ? e.message : "Something went wrong. Please try again.";

/** Local-only guard + uniform JSON errors for route handlers. Risk/validation => 400, rest => 500. */
export function withApi<C = unknown>(handler: (req: Request, ctx: C) => Promise<Response>) {
  return async (req: Request, ctx: C) => {
    if (!hostAllowed(req)) return NextResponse.json({ error: "This app only answers on localhost." }, { status: 403 });
    if (!sameOrigin(req)) return NextResponse.json({ error: "Cross-site request refused." }, { status: 403 });
    try {
      await ready();
      return await handler(req, ctx);
    } catch (e) {
      if (e instanceof RiskError || e instanceof PmLiveError) return NextResponse.json({ error: e.message }, { status: 400 });
      if (e instanceof ZodError) return NextResponse.json({ error: e.issues.map((i) => i.message).join("; ") }, { status: 400 });
      console.error("[api]", e instanceof Error ? e.message : "failed");
      return NextResponse.json({ error: safeMessage(e) }, { status: 500 });
    }
  };
}

/** Parse a JSON body; a missing or malformed body is a 400, not a 500. */
export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new RiskError("Send a JSON body.");
  }
}
