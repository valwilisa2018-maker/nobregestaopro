import { createFileRoute } from "@tanstack/react-router";
import { TendenciasView, useOmData } from "@/components/operacao-meta/shared";

export const Route = createFileRoute("/_authenticated/operacao-meta/tendencias")({
  component: () => {
    const d = useOmData();
    return <TendenciasView {...d} />;
  },
});