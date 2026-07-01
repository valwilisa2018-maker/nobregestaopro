import { createFileRoute, Link } from "@tanstack/react-router";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Activity, MessageSquare, MessagesSquare, Timer, Coins, DollarSign, Plug, Bot,
  Plus, Search, ArrowUpRight, Zap, Users, ScrollText,
} from "lucide-react";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Plataforma IA" }] }),
  component: Dashboard,
});

const stats = [
  { label: "Tokens", value: "0", delta: "+0%", icon: Coins, tone: "primary" as const },
  { label: "Custo IA", value: "R$ 0,00", delta: "—", icon: DollarSign, tone: "accent" as const },
  { label: "Requisições", value: "0", delta: "+0%", icon: Zap, tone: "primary" as const },
  { label: "Usuários Online", value: "0", delta: "agora", icon: Users, tone: "accent" as const },
  { label: "Agentes Ativos", value: "0", delta: "0 total", icon: Bot, tone: "primary" as const },
  { label: "Conversas", value: "0", delta: "hoje", icon: MessagesSquare, tone: "accent" as const },
  { label: "Mensagens", value: "0", delta: "hoje", icon: MessageSquare, tone: "primary" as const },
  { label: "Tempo médio", value: "—", delta: "—", icon: Timer, tone: "accent" as const },
];

function Dashboard() {
  return (
    <div className="space-y-6 animate-fade-in">
      {/* Hero */}
      <div
        className="relative overflow-hidden rounded-3xl border border-border/60 p-6 md:p-8"
        style={{ background: "var(--gradient-mesh), var(--card)" }}
      >
        <div className="absolute -right-20 -top-24 h-72 w-72 rounded-full bg-primary/25 blur-3xl" />
        <div className="absolute -left-16 -bottom-16 h-56 w-56 rounded-full bg-accent/25 blur-3xl" />
        <div className="relative grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4 sm:flex sm:flex-wrap sm:justify-between">
          <div className="min-w-0 space-y-2">
            <Badge variant="outline" className="bg-primary/15 text-primary border-primary/40">
              <Zap className="h-3 w-3" /> Plataforma IA Premium
            </Badge>
            <h1 className="text-3xl md:text-4xl font-black tracking-tight bg-clip-text text-transparent"
              style={{ backgroundImage: "var(--gradient-primary)" }}>
              Central de Comando
            </h1>
            <p className="text-sm text-muted-foreground max-w-xl">
              Gerencie agentes de IA, conexões e conversas em tempo real com performance de nível enterprise.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative hidden md:block">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar agentes, conversas..." className="pl-9 w-72 bg-background/40 backdrop-blur border-border/60" />
            </div>
            <Button asChild className="shadow-lg" style={{ boxShadow: "var(--shadow-elegant)" }}>
              <Link to="/agents"><Plus className="h-4 w-4" /> Novo Agente</Link>
            </Button>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {stats.map((s) => (
          <Card key={s.label} className="group relative overflow-hidden border-border/50 hover:border-primary/40 transition-all hover:-translate-y-0.5">
            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ background: "var(--gradient-mesh)" }} />
            <CardHeader className="relative pb-1 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{s.label}</CardTitle>
              <div className={`grid h-8 w-8 place-items-center rounded-lg ${s.tone === "primary" ? "bg-primary/15 text-primary" : "bg-accent/15 text-accent"}`}>
                <s.icon className="h-4 w-4" />
              </div>
            </CardHeader>
            <CardContent className="relative space-y-1">
              <div className="text-2xl font-bold">{s.value}</div>
              <div className="text-[11px] text-muted-foreground flex items-center gap-1">
                <ArrowUpRight className="h-3 w-3" /> {s.delta}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Panels */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2 border-border/50 overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2"><Activity className="h-4 w-4 text-primary" /> Últimas Conversas</CardTitle>
              <p className="text-xs text-muted-foreground mt-1">Interações mais recentes dos seus agentes</p>
            </div>
            <Button asChild variant="ghost" size="sm"><Link to="/conversations">Ver todas <ArrowUpRight className="h-3 w-3" /></Link></Button>
          </CardHeader>
          <CardContent>
            <div className="rounded-xl border border-dashed border-border/60 p-10 text-center space-y-2">
              <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-primary/10 text-primary">
                <MessagesSquare className="h-5 w-5" />
              </div>
              <p className="text-sm text-muted-foreground">Nenhuma conversa ainda. Conecte seu WhatsApp para começar.</p>
              <Button asChild variant="outline" size="sm"><Link to="/whatsapp"><Plug className="h-3.5 w-3.5" /> Conectar</Link></Button>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/50">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><ScrollText className="h-4 w-4 text-accent" /> Logs Recentes</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">Atividade do sistema</p>
          </CardHeader>
          <CardContent>
            <div className="rounded-xl border border-dashed border-border/60 p-8 text-center space-y-2">
              <p className="text-sm text-muted-foreground">Sistema aguardando eventos.</p>
              <Button asChild variant="ghost" size="sm"><Link to="/logs">Abrir logs</Link></Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}