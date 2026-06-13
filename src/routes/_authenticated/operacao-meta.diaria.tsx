import { createFileRoute } from "@tanstack/react-router";
import { DiariaView, useOmData } from "@/components/operacao-meta/shared";

export const Route = createFileRoute("/_authenticated/operacao-meta/diaria")({
  component: () => {
    const d = useOmData();
    return <DiariaView {...d} />;
  },
});