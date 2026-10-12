import { NextResponse } from "next/server";
import { hostAllowed } from "@/lib/api";
import { copyBus, type CopyEvent } from "@/lib/copy/engine";
import { sse } from "@/lib/sse";

export const dynamic = "force-dynamic";

/** What your copy bots do, live (SSE): one message per copied trade, skip or failure. */
export async function GET(req: Request) {
  if (!hostAllowed(req)) return NextResponse.json({ error: "This app only answers on localhost." }, { status: 403 });
  return sse(req, (send) => {
    const on = (e: CopyEvent) => send(e);
    copyBus.on("event", on);
    return () => copyBus.off("event", on);
  });
}
