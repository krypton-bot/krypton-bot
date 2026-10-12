import { AppSidebar } from "@/components/app-sidebar";
import { SiteHeader } from "@/components/site-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

/** dashboard-01 inset shell: sidebar with the bot dock, header, content. */
export function AppShell({ mode, children }: { mode?: "paper" | "live"; children: React.ReactNode }) {
  return (
    <SidebarProvider style={{ "--sidebar-width": "calc(var(--spacing) * 64)", "--header-height": "calc(var(--spacing) * 12)" } as React.CSSProperties}>
      <AppSidebar variant="inset" />
      <SidebarInset>
        <SiteHeader mode={mode} />
        <div className="@container/main flex flex-1 flex-col gap-4 p-4 lg:gap-6 lg:p-6">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
