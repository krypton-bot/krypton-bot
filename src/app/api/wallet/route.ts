import { NextResponse } from "next/server";
import { z } from "zod";
import { readJson, withApi } from "@/lib/api";
import { updateSettings } from "@/lib/trading";
import { clearWallet, saveWallet, walletInfo } from "@/lib/trading/pm-live";

const Save = z.object({
  privateKey: z.string().trim().regex(/^0x[0-9a-fA-F]{64}$/, "A private key is 0x followed by 64 hex characters."),
  funder: z.string().trim().regex(/^0x[0-9a-fA-F]{40}$/, "The funder must be a 0x wallet address.").optional().or(z.literal("")),
});

/** Connection status. Addresses only: the key is never returned. */
export const GET = withApi(async () => NextResponse.json(await walletInfo()));

/** Save your own signer key (encrypted at rest in ./data). It is never echoed back and never logged. */
export const PUT = withApi(async (req) => {
  const b = Save.parse(await readJson(req));
  await saveWallet(b.privateKey, b.funder || undefined);
  return NextResponse.json(await walletInfo());
});

/** Forget the saved key and fall back to paper mode. A key set through the environment is not touched. */
export const DELETE = withApi(async () => {
  await clearWallet();
  if (!(await walletInfo()).connected) await updateSettings({ mode: "paper" });
  return NextResponse.json(await walletInfo());
});
