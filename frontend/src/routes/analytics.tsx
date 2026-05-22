import { createFileRoute } from "@tanstack/react-router";
import { AuthGuard } from "@/components/AuthGuard";
import { Analytics } from "@/pages/Analytics";

export const Route = createFileRoute("/analytics")({
  head: () => ({
    meta: [{ title: "Analytics · BugLens" }],
  }),
  component: () => (
    <AuthGuard>
      <Analytics />
    </AuthGuard>
  ),
});
