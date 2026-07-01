import { createFileRoute } from "@tanstack/react-router";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Plataforma IA WhatsApp" }] }),
  component: Dashboard,
});

const stats = [
  { label: "Atendimentos", value: "0" },
  { label: "Conversas abertas", value: "0" },
  { label: "Mensagens", value: "0" },
  { label: "Tempo médio", value: "—" },
  { label: "Tokens", value: "0" },
  { label: "Custo IA", value: "R$ 0,00" },
  { label: "Números conectados", value: "0" },
  { label: "Agentes ativos", value: "0" },
];

function Dashboard() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">Visão geral em tempo real da plataforma.</p>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{s.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{s.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}