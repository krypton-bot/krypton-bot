import { NextResponse } from "next/server";
import { withApi } from "@/lib/api";
import { getSettings } from "@/lib/trading";
import { pmPortfolio } from "@/lib/trading/predictions";

/** Copy portfolio for the current mode: positions at live prices, value, open and realized P/L, cash. */
export const GET = withApi(async () => {
  const [p, s] = await Promise.all([pmPortfolio(30), getSettings()]);
  return NextResponse.json({ ...p, cash: s.mode === "paper" ? s.paperBalance : null });
});
