import { NextResponse } from "next/server";
import { withApi } from "@/lib/api";
import { recentEvents } from "@/lib/copy/engine";

export const GET = withApi(async () => NextResponse.json({ events: await recentEvents(100) }));
