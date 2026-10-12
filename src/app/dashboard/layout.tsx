import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { ready } from "@/db";
import { getSettings } from "@/lib/trading";

export const metadata: Metadata = { title: "Dashboard" };
// Every dashboard page reads the local database: never prerender at build time.
export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  await ready();
  const settings = await getSettings();
  return <AppShell mode={settings.mode}>{children}</AppShell>;
}
