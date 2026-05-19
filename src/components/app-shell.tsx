import type { ReactNode } from "react";
import { AppSidebar } from "@/components/app-sidebar";
import { TopNavbar } from "@/components/top-navbar";

export function AppShell({
  crumbs,
  children,
}: {
  crumbs: { label: string; to?: string }[];
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen w-full bg-background text-foreground">
      <AppSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopNavbar crumbs={crumbs} />
        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </div>
  );
}
