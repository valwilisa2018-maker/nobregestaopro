import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AlertCircle, Info, AlertTriangle, ShieldAlert, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";

export function SystemLogsTable() {
  const [limit, setLimit] = useState(50);
  
  const { data: logs, isLoading, refetch } = useQuery({
    queryKey: ["system-logs", limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("system_logs")
        .select("*, profiles:user_id(full_name)")
        .order("created_at", { ascending: false })
        .limit(limit);
      
      if (error) throw error;
      return data;
    },
    refetchInterval: 30000, // Refresh every 30s
  });

  const getLevelBadge = (level: string) => {
    switch (level) {
      case "CRITICAL":
        return <Badge variant="destructive" className="gap-1"><ShieldAlert className="w-3 h-3" /> Crítico</Badge>;
      case "ERROR":
        return <Badge variant="destructive" className="gap-1"><AlertCircle className="w-3 h-3" /> Erro</Badge>;
      case "WARN":
        return <Badge variant="outline" className="text-yellow-500 border-yellow-500 gap-1"><AlertTriangle className="w-3 h-3" /> Aviso</Badge>;
      default:
        return <Badge variant="secondary" className="gap-1"><Info className="w-3 h-3" /> Info</Badge>;
    }
  };

  if (isLoading) return <div className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-medium">Logs de Erros e Atividades</h3>
        <Button variant="outline" size="sm" onClick={() => refetch()}>Atualizar agora</Button>
      </div>
      
      <div className="border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[180px]">Data/Hora</TableHead>
              <TableHead className="w-[100px]">Nível</TableHead>
              <TableHead className="w-[150px]">Contexto</TableHead>
              <TableHead>Mensagem</TableHead>
              <TableHead>Usuário</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logs?.map((log) => (
              <TableRow key={log.id} className={log.level === "CRITICAL" ? "bg-red-500/5" : ""}>
                <TableCell className="text-xs font-mono">
                  {format(new Date(log.created_at), "dd/MM/yy HH:mm:ss", { locale: ptBR })}
                </TableCell>
                <TableCell>{getLevelBadge(log.level)}</TableCell>
                <TableCell>
                  <Badge variant="outline" className="text-[10px] uppercase font-bold">
                    {log.context || "geral"}
                  </Badge>
                </TableCell>
                <TableCell className="max-w-md truncate" title={JSON.stringify(log.details, null, 2)}>
                  <div className="font-medium text-sm">{log.message}</div>
                  {log.details && (
                    <div className="text-[10px] text-muted-foreground truncate opacity-70">
                      {typeof log.details === "string" ? log.details : JSON.stringify(log.details)}
                    </div>
                  )}
                </TableCell>
                <TableCell className="text-xs">
                  {(log.profiles as any)?.full_name || "Sistema"}
                </TableCell>
              </TableRow>
            ))}
            {logs?.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                  Nenhum log registrado.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      
      {logs && logs.length >= limit && (
        <div className="flex justify-center">
          <Button variant="ghost" size="sm" onClick={() => setLimit(prev => prev + 50)}>
            Carregar mais
          </Button>
        </div>
      )}
    </div>
  );
}
