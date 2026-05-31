import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, Upload, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useState, useRef } from "react";

const TABLES = [
  "customers", "sellers", "producers", "service_types", "packages",
  "kanban_columns", "sales", "service_orders", "invoices",
  "expenses", "cash_movements", "goals",
] as const;

export const Route = createFileRoute("/_authenticated/backup")({
  component: BackupPage,
});

function BackupPage() {
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const exportAll = async () => {
    setExporting(true);
    try {
      const dump: Record<string, any[]> = {};
      for (const t of TABLES) {
        const { data, error } = await supabase.from(t as any).select("*");
        if (error) throw new Error(`${t}: ${error.message}`);
        dump[t] = data ?? [];
      }
      const payload = {
        version: 1,
        exported_at: new Date().toISOString(),
        tables: dump,
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `backup-completo-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Backup completo gerado");
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao exportar");
    } finally {
      setExporting(false);
    }
  };

  const exportTable = async (table: string) => {
    const { data, error } = await supabase.from(table as any).select("*");
    if (error) return toast.error(error.message);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${table}-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`${table} exportado`);
  };

  const importAll = async (file: File) => {
    if (!confirm("Importar irá ADICIONAR os registros do arquivo ao banco atual (sem apagar nada). Deseja continuar?")) return;
    setImporting(true);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const tables: Record<string, any[]> = parsed.tables ?? parsed;
      let totalOk = 0;
      const errors: string[] = [];
      for (const t of TABLES) {
        const rows = tables[t];
        if (!Array.isArray(rows) || rows.length === 0) continue;
        // upsert by id to evitar duplicar se rodar 2x
        const { error } = await supabase.from(t as any).upsert(rows, { onConflict: "id" });
        if (error) {
          errors.push(`${t}: ${error.message}`);
        } else {
          totalOk += rows.length;
        }
      }
      if (errors.length) {
        toast.error(`Importado ${totalOk} registros. Erros: ${errors.join(" | ")}`);
      } else {
        toast.success(`Importação concluída — ${totalOk} registros`);
      }
    } catch (e: any) {
      toast.error(e.message ?? "Arquivo inválido");
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Backup e Restauração</h1>
        <p className="text-muted-foreground">Baixe um arquivo único com tudo e restaure quando precisar</p>
      </div>

      <Card className="border-border/50" style={{ boxShadow: "var(--shadow-card)" }}>
        <CardHeader>
          <CardTitle>Backup completo</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Gera um arquivo JSON único contendo: clientes, vendas, serviços (kanban), notas fiscais, despesas,
            movimentações de caixa, vendedores, produtores, tipos de serviço, pacotes, colunas e metas.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button onClick={exportAll} disabled={exporting}>
              {exporting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
              Baixar backup completo
            </Button>
            <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={importing}>
              {importing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
              Importar backup
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) importAll(f);
              }}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            A importação faz upsert por <code>id</code> — registros existentes são atualizados e novos são inseridos. Nada é apagado.
          </p>
        </CardContent>
      </Card>

      <div>
        <h2 className="text-xl font-semibold mb-3">Exportar tabelas individuais</h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {TABLES.map((t) => (
            <Card key={t} className="border-border/50" style={{ boxShadow: "var(--shadow-card)" }}>
              <CardHeader><CardTitle className="capitalize text-base">{t.replace(/_/g, " ")}</CardTitle></CardHeader>
              <CardContent>
                <Button variant="outline" className="w-full" onClick={() => exportTable(t)}>
                  <Download className="w-4 h-4 mr-2" />Exportar
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}