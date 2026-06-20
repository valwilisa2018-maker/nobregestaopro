import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/operacao-meta/")({
  beforeLoad: () => {
    throw redirect({ to: "/operacao-meta/visao-geral" });
  },
});