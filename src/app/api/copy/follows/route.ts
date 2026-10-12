import { NextResponse } from "next/server";
import { z } from "zod";
import { readJson, withApi } from "@/lib/api";
import { follow, listFollows, unfollow, updateFollow } from "@/lib/copy/engine";

const Create = z.object({
  wallet: z.string().trim().regex(/^0x[a-fA-F0-9]{40}$/, "Enter a valid wallet address (0x…)"),
  pct: z.number().min(1).max(100).optional(),
  maxUsd: z.number().min(1).max(10_000).optional(),
  label: z.string().trim().max(60).nullable().optional(),
});
const Patch = z.object({
  id: z.number().int().positive(),
  pct: z.number().min(1).max(100).optional(),
  maxUsd: z.number().min(1).max(10_000).optional(),
  active: z.boolean().optional(),
  label: z.string().trim().max(60).nullable().optional(),
});

export const GET = withApi(async () => NextResponse.json({ follows: await listFollows() }));

export const POST = withApi(async (req) => {
  const b = Create.parse(await readJson(req));
  return NextResponse.json({ follow: await follow(b.wallet, b) });
});

export const PATCH = withApi(async (req) => {
  const { id, ...patch } = Patch.parse(await readJson(req));
  return NextResponse.json({ follow: await updateFollow(id, patch) });
});

export const DELETE = withApi(async (req) => {
  const { id } = z.object({ id: z.number().int().positive() }).parse(await readJson(req));
  await unfollow(id);
  return NextResponse.json({ ok: true });
});
