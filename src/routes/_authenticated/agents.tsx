import { createFileRoute } from "@tanstack/react-router";
import { AgentsPage } from "@/components/agents/agents-page";

export const Route = createFileRoute("/_authenticated/agents")({
  head: () => ({ meta: [{ title: "Agentes IA — Plataforma" }] }),
  component: AgentsPage,
});
