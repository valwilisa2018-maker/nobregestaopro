import { createFileRoute } from "@tanstack/react-router";
import { DinamicaView, useOmData } from "@/components/operacao-meta/shared";

export const Route = createFileRoute("/_authenticated/operacao-meta/dinamica")({
  component: () => {
    const d = useOmData();
    return <DinamicaView {...d} />;
  },
});