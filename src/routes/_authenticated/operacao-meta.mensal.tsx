import { createFileRoute } from "@tanstack/react-router";
import { MensalView, useOmData } from "@/components/operacao-meta/shared";

export const Route = createFileRoute("/_authenticated/operacao-meta/mensal")({
  component: () => {
    const d = useOmData();
    return <MensalView {...d} />;
  },
});