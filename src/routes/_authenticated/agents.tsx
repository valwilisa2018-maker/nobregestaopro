import { createFileRoute } from "@tanstack/react-router";
import { AgentsPage } from "@/components/agents/agents-page";
import { TutorialVideo } from "@/components/tutorial-video";

export const Route = createFileRoute("/_authenticated/agents")({
  head: () => ({ meta: [{ title: "Agentes IA — Plataforma" }] }),
  component: AgentsWithTutorial,
});

function AgentsWithTutorial() {
  return (
    <div className="space-y-4">
      <div className="px-4 md:px-6 pt-4"><TutorialVideo moduleKey="agents" title="Como criar Agentes de IA" /></div>
      <AgentsPage />
    </div>
  );
}
