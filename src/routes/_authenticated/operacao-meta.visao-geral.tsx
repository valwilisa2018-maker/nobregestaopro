import { createFileRoute } from "@tanstack/react-router";
import { VisaoGeralView, useOmData } from "@/components/operacao-meta/shared";

export const Route = createFileRoute("/_authenticated/operacao-meta/visao-geral")({
  component: VisaoGeralPage,
});

function VisaoGeralPage() {
  const d = useOmData();
  return <VisaoGeralView {...d} />;
}
