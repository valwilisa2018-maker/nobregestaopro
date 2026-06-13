import { createFileRoute } from "@tanstack/react-router";
import { ConquistasView, useOmData } from "@/components/operacao-meta/shared";

export const Route = createFileRoute("/_authenticated/operacao-meta/conquistas")({
  component: () => {
    const d = useOmData();
    return <ConquistasView {...d} />;
  },
});