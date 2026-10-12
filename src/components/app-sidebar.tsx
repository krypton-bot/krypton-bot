"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CopyIcon, LayoutDashboardIcon, LockIcon, Settings2Icon, SparklesIcon } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { BotDock } from "@/components/bot-dock";
import { SidebarBalance } from "@/components/sidebar-balance";
import { CLOUD_FEATURES, CLOUD_URL } from "@/lib/site";

type Item = { title: string; url: string; icon: React.ComponentType };

const MAIN: Item[] = [{ title: "Overview", url: "/dashboard", icon: LayoutDashboardIcon }];
const TRADE: Item[] = [{ title: "Copy trade", url: "/dashboard/copy", icon: CopyIcon }];
const SECONDARY: Item[] = [{ title: "Settings", url: "/dashboard/settings", icon: Settings2Icon }];

function Items({ items, path }: { items: Item[]; path: string }) {
  return (
    <SidebarMenu>
      {items.map((item) => (
        <SidebarMenuItem key={item.url}>
          <SidebarMenuButton tooltip={item.title} isActive={path === item.url} render={<Link href={item.url} />}>
            <item.icon />
            <span>{item.title}</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      ))}
    </SidebarMenu>
  );
}

/** Cloud-only features: visible, locked, and a straight link to krypton.bot. */
function LockedItems() {
  return (
    <SidebarMenu>
      {CLOUD_FEATURES.map((f) => (
        <SidebarMenuItem key={f.title}>
          <SidebarMenuButton
            tooltip={`${f.title}: unlock in Krypton.Bot Cloud`}
            className="text-sidebar-foreground/60"
            render={<a href={CLOUD_URL} target="_blank" rel="noopener noreferrer" aria-label={`${f.title} (locked, opens krypton.bot)`} />}
          >
            <f.icon />
            <span>{f.title}</span>
            <LockIcon className="ml-auto size-3.5 text-muted-foreground" aria-hidden />
          </SidebarMenuButton>
        </SidebarMenuItem>
      ))}
    </SidebarMenu>
  );
}

export function AppSidebar(props: React.ComponentProps<typeof Sidebar>) {
  const path = usePathname();
  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <BotDock />
        <SidebarBalance />
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <Items items={MAIN} path={path} />
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Trade</SidebarGroupLabel>
          <SidebarGroupContent>
            <Items items={TRADE} path={path} />
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>In the Cloud</SidebarGroupLabel>
          <SidebarGroupContent>
            <LockedItems />
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup className="mt-auto">
          <SidebarGroupContent>
            <Items items={SECONDARY} path={path} />
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <Link
          href="/dashboard/cloud"
          className="group relative overflow-hidden rounded-xl border border-brand/40 bg-gradient-to-br from-brand/20 via-brand/5 to-transparent p-3 transition-colors hover:border-brand"
        >
          <span className="flex items-center gap-2 text-sm font-semibold">
            <SparklesIcon className="size-4 text-brand" aria-hidden /> Unlock in Krypton.Bot Cloud
          </span>
          <span className="mt-0.5 block text-xs text-muted-foreground">AI picks, autopilot, perps and markets, hosted and always on.</span>
        </Link>
      </SidebarFooter>
    </Sidebar>
  );
}
