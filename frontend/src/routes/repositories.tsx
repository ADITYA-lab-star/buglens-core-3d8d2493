import { createFileRoute } from "@tanstack/react-router";
import { AuthGuard } from "@/components/AuthGuard";
import { Repositories } from "@/pages/Repositories";

export const Route = createFileRoute("/repositories")({
  head: () => ({
    meta: [{ title: "Repositories · BugLens" }],
  }),
  component: () => (
    <AuthGuard>
      <Repositories />
    </AuthGuard>
  ),
});
