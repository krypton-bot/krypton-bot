"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CopyIcon } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";

const TITLES: [string, string][] = [
  ["/dashboard/copy", "Copy trade"],
  ["/dashboard/settings", "Settings"],
  ["/dashboard/cloud", "Krypton.Bot Cloud"],
  ["/dashboard", "Overview"],
];

export function SiteHeader({ mode }: { mode?: "paper" | "live" }) {
  const path = usePathname();
  return (
    <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
      <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mx-2 h-4 data-vertical:self-auto" />
        <h1 className="text-base font-medium">{TITLES.find(([p]) => path === p || (p !== "/dashboard" && path.startsWith(p)))?.[1] ?? "Dashboard"}</h1>
        {mode && (
          <span className={`ml-auto rounded-full px-2.5 py-0.5 text-xs font-semibold ${mode === "live" ? "bg-short/15 text-short" : "bg-brand/15 text-brand"}`}>
            {mode === "live" ? "LIVE trading" : "Paper mode"}
          </span>
        )}
        {path !== "/dashboard/copy" && (
          <Link
            href="/dashboard/copy"
            className={`${mode ? "" : "ml-auto "}inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-brand-foreground hover:brightness-110`}
          >
            <CopyIcon className="size-3.5" aria-hidden /> Copy a trader
          </Link>
        )}
      </div>
    </header>
  );
}
