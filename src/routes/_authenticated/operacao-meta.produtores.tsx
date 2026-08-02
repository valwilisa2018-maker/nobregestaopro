import { createFileRoute } from "@tanstack/react-router";
import { ProdutoresView, useOmData } from "@/components/operacao-meta/shared";

export const Route = createFileRoute("/_authenticated/operacao-meta/produtores")({
  component: ProdutoresPage,
});

function ProdutoresPage() {
  const d = useOmData();
  return <ProdutoresView {...d} />;
}
