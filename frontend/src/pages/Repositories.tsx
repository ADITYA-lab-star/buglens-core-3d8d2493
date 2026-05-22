import { AppShell } from "@/components/app-shell";

export function Repositories() {
  return (
    <AppShell crumbs={[{ label: "BugLens", to: "/" }, { label: "Repositories" }]}>
      <div className="mx-auto max-w-7xl px-6 py-8 animate-in fade-in duration-500">
        <h1 className="text-3xl font-bold tracking-tight">Repositories</h1>
        <p className="text-muted-foreground mt-2">Manage your connected repositories here.</p>
        <div className="mt-8 rounded-xl border border-dashed border-border bg-muted/20 p-12 text-center flex flex-col items-center justify-center min-h-[400px]">
          <h3 className="mt-4 text-lg font-semibold">Coming Soon</h3>
          <p className="mt-2 text-sm text-muted-foreground max-w-sm mx-auto">
            Repository management features are currently under development.
          </p>
        </div>
      </div>
    </AppShell>
  );
}
