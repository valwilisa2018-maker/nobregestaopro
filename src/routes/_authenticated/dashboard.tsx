import { createFileRoute } from "@tanstack/react-router";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Activity, MessageSquare, MessagesSquare, Timer, Coins, DollarSign, Plug, Bot } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Plataforma IA WhatsApp" }] }),
  component: Dashboard,
});

const stats = [
  { label: "Atendimentos", value: "0", icon: Activity },
  { label: "Conversas abertas", value: "0", icon: MessagesSquare },
  { label: "Mensagens", value: "0", icon: MessageSquare },
  { label: "Tempo médio", value: "—", icon: Timer },
  { label: "Tokens", value: "0", icon: Coins },
  { label: "Custo IA", value: "R$ 0,00", icon: DollarSign },
  { label: "Números conectados", value: "0", icon: Plug },
  { label: "Agentes ativos", value: "0", icon: Bot },
];

function Dashboard() {
  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-card via-card to-accent/30 p-6">
        <div className="absolute -right-20 -top-20 h-56 w-56 rounded-full bg-primary/15 blur-3xl" />
        <div className="relative">
          <h1 className="text-3xl font-bold tracking-tight">Central de Atendimento IA</h1>
          <p className="text-muted-foreground mt-1">Visão geral em tempo real da sua operação de WhatsApp.</p>
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {stats.map((s) => (
          <Card key={s.label} className="relative overflow-hidden border-border/60 hover:border-primary/40 transition-colors">
            <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{s.label}</CardTitle>
              <s.icon className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">{s.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}