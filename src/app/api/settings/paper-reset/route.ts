import { NextResponse } from "next/server";
import { withApi } from "@/lib/api";
import { resetPaper } from "@/lib/trading";

/** Back to a fresh $10,000 paper account. Copy bots, settings and live data are untouched. */
export const POST = withApi(async () => {
  await resetPaper();
  return NextResponse.json({ ok: true });
});
