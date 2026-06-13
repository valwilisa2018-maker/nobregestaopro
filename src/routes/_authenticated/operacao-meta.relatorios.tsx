import { createFileRoute } from "@tanstack/react-router";
import { RelatoriosView, useOmData } from "@/components/operacao-meta/shared";

export const Route = createFileRoute("/_authenticated/operacao-meta/relatorios")({
  component: () => {
    const d = useOmData();
    return <RelatoriosView {...d} />;
  },
});