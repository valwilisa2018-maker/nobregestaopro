import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Activity, 
  Database, 
  AlertCircle, 
  CheckCircle2, 
  Clock, 
  Server,
  RefreshCcw,
  ShieldAlert
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Button } from "@/components/ui/button";

export function SystemHealthDashboard() {
  const { data: health, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["system-health"],
    queryFn: async () => {
      const start = performance.now();
      
      // Check Supabase Connectivity & Recent Errors
      const { data: recentLogs, error: logsError } = await supabase
        .from("system_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(5);

      const { count: criticalCount, error: criticalError } = await supabase
        .from("system_logs")
        .select("id", { count: "exact", head: true })
        .eq("level" as any, "CRITICAL")
        .gt("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

      const end = performance.now();
      const latency = Math.round(end - start);

      // We use a dummy query to check DB responsiveness
      const { error: pingError } = await supabase.from("system_logs").select("id").limit(1);

      return {
        dbStatus: !pingError ? "online" : "offline",
        latency,
        recentLogs: recentLogs || [],
        criticalCount: criticalCount || 0,
        lastCheck: new Date(),
        error: pingError || logsError || criticalError
      };
    },
    refetchInterval: 60000, // Auto refresh every minute
  });

  const getStatusBadge = (status: string) => {
    if (status === "online") return <Badge variant="default" className="bg-emerald-500 hover:bg-emerald-600 gap-1"><CheckCircle2 className="w-3 h-3" /> Online</Badge>;
    return <Badge variant="destructive" className="gap-1"><ShieldAlert className="w-3 h-3" /> Offline</Badge>;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-primary" />
          <h2 className="text-xl font-bold">Saúde do Sistema</h2>
        </div>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={() => refetch()} 
          disabled={isRefetching}
          className="gap-2"
        >
          <RefreshCcw className={`w-3 h-3 ${isRefetching ? 'animate-spin' : ''}`} />
          Atualizar
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="bg-card/50 backdrop-blur-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Banco de Dados</CardTitle>
            <Database className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{health ? getStatusBadge(health.dbStatus) : "---"}</div>
            <p className="text-xs text-muted-foreground mt-1">Supabase PostgreSQL</p>
          </CardContent>
        </Card>

        <Card className="bg-card/50 backdrop-blur-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Latência (API)</CardTitle>
            <Server className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${health?.latency && health.latency > 500 ? 'text-yellow-500' : ''}`}>
              {health ? `${health.latency}ms` : "---"}
            </div>
            <p className="text-xs text-muted-foreground mt-1 text-emerald-500">Excelente</p>
          </CardContent>
        </Card>

        <Card className="bg-card/50 backdrop-blur-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Críticos (24h)</CardTitle>
            <AlertCircle className="w-4 h-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${typeof health?.criticalCount === 'number' && health.criticalCount > 0 ? 'text-destructive' : ''}`}>
              {health?.criticalCount ?? 0}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Erros de alta prioridade</p>
          </CardContent>
        </Card>

        <Card className="bg-card/50 backdrop-blur-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Última Checagem</CardTitle>
            <Clock className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-lg font-bold">
              {health ? format(health.lastCheck, "HH:mm:ss", { locale: ptBR }) : "---"}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Refetch automático ativo</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Zap className="w-4 h-4 text-yellow-500" /> 
            Logs Recentes em Tempo Real
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {health?.recentLogs.map((log: any) => (
              <div key={log.id} className="flex items-start justify-between border-b pb-2 last:border-0">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Badge variant={log.level === 'ERROR' || log.level === 'CRITICAL' ? 'destructive' : 'outline'} className="text-[10px]">
                      {log.level}
                    </Badge>
                    <span className="text-sm font-medium">{log.message}</span>
                  </div>
                  <p className="text-xs text-muted-foreground font-mono">
                    {log.context || "geral"} • {format(new Date(log.created_at), "dd/MM HH:mm:ss")}
                  </p>
                </div>
              </div>
            ))}
            {(!health?.recentLogs || health.recentLogs.length === 0) && (
              <p className="text-center py-4 text-sm text-muted-foreground">Sem logs recentes.</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

const Zap = ({ className }: { className?: string }) => (
  <svg 
    xmlns="http://www.w3.org/2000/svg" 
    width="24" 
    height="24" 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round" 
    className={className}
  >
    <path d="M4 14.71 14.15 4 11.5 10.25h8.5L9.85 21 12.5 14.75H4z"/>
  </svg>
);
