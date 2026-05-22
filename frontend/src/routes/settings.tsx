import { createFileRoute } from "@tanstack/react-router";
import { AuthGuard } from "@/components/AuthGuard";
import { Settings } from "@/pages/Settings";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [{ title: "Settings · BugLens" }],
  }),
  component: () => (
    <AuthGuard>
      <Settings />
    </AuthGuard>
  ),
});
