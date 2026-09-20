import { createFileRoute } from "@tanstack/react-router";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, Upload, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllPaged } from "@/lib/queries/paginate";
import { toast } from "@/lib/toast";
import { useState, useRef } from "react";
import { PageHero } from "@/components/page-hero";

// Ordem importa: tabelas "pai" primeiro para a importação não falhar por vínculo.
// `conflict` é a chave usada no upsert de cada tabela.
const TABLES: { name: string; conflict: string; label: string }[] = [
  { name: "profiles", conflict: "id", label: "Usuários (perfis)" },
  { name: "user_roles", conflict: "id", label: "Papéis de usuário" },
  { name: "user_permissions", conflict: "user_id,module", label: "Permissões" },
  { name: "service_types", conflict: "id", label: "Tipos de serviço" },
  { name: "producers", conflict: "id", label: "Produtores" },
  { name: "sellers", conflict: "id", label: "Vendedores" },
  { name: "packages", conflict: "id", label: "Pacotes" },
  { name: "kanban_columns", conflict: "id", label: "Colunas do Kanban" },
  { name: "customers", conflict: "id", label: "Clientes" },
  { name: "goals", conflict: "id", label: "Metas" },
  { name: "sales", conflict: "id", label: "Vendas" },
  { name: "service_orders", conflict: "id", label: "Ordens de serviço (Kanban)" },
  { name: "service_order_alterations", conflict: "id", label: "Alterações de serviço" },
  { name: "service_order_history", conflict: "id", label: "Histórico de movimentações" },
  { name: "invoices", conflict: "id", label: "Notas fiscais" },
  { name: "sale_receipts", conflict: "id", label: "Comprovantes de venda" },
  { name: "expenses", conflict: "id", label: "Despesas" },
  { name: "cash_movements", conflict: "id", label: "Movimentações de caixa" },
  { name: "project_folders", conflict: "id", label: "Pastas de projeto" },
  { name: "project_folder_files", conflict: "id", label: "Arquivos das pastas" },
  { name: "project_folder_messages", conflict: "id", label: "Mensagens das pastas" },
  { name: "om_settings", conflict: "id", label: "Operação de Meta — ajustes" },
  { name: "om_scoring", conflict: "evento", label: "Operação de Meta — pontuação" },
  { name: "om_trello_list_map", conflict: "id", label: "Operação de Meta — listas Trello" },
  { name: "om_trello_member_map", conflict: "id", label: "Operação de Meta — membros Trello" },
  { name: "om_eventos", conflict: "id", label: "Operação de Meta — eventos" },
  { name: "whatsapp_connections", conflict: "id", label: "Conexões de WhatsApp" },
  { name: "whatsapp_messages", conflict: "id", label: "Mensagens de WhatsApp" },
  { name: "workflows", conflict: "id", label: "Fluxos de conversa" },
  { name: "workflow_versions", conflict: "id", label: "Versões dos fluxos" },
  { name: "workflow_triggers", conflict: "id", label: "Gatilhos dos fluxos" },
  { name: "workflow_shares", conflict: "id", label: "Compartilhamentos de fluxo" },
  { name: "followup_rules", conflict: "id", label: "Regras de follow-up" },
  { name: "followup_queue", conflict: "id", label: "Fila de follow-up" },
  { name: "followup_history", conflict: "id", label: "Histórico de follow-up" },
  { name: "workflow_runs", conflict: "id", label: "Conversas dos fluxos" },
  { name: "workflow_run_steps", conflict: "id", label: "Etapas das conversas" },
  { name: "plans", conflict: "id", label: "Planos" },
  { name: "subscription", conflict: "id", label: "Assinatura" },
  { name: "system_announcements", conflict: "id", label: "Avisos do sistema" },
  { name: "telao_settings", conflict: "id", label: "Ajustes do telão" },
  { name: "white_label_settings", conflict: "id", label: "Personalização visual" },
  { name: "pagarme_installment_rates", conflict: "installments", label: "Taxas de parcelamento" },
  { name: "audit_logs", conflict: "id", label: "Auditoria" },
  { name: "system_logs", conflict: "id", label: "Logs do sistema" },
];

export const Route = createFileRoute("/_authenticated/backup")({
  component: BackupPage,
});

function downloadJson(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function fetchTableRows(table: string) {
  return fetchAllPaged<Record<string, unknown>>((from, to) =>
    supabase
      .from(table as any)
      .select("*")
      .range(from, to) as any,
  );
}

function BackupPage() {
  const navigate = useNavigate();
  const adminCheck = useQuery({
    queryKey: ["is-admin-check"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return false;
      const { data, error } = await supabase.rpc("has_role", { _user_id: user.id, _role: "admin" });
      if (error) return false;
      return data === true;
    },
    staleTime: 60_000,
  });
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const exportAll = async () => {
    setExporting(true);
    try {
      const dump: Record<string, unknown[]> = {};
      const skipped: string[] = [];
      let total = 0;
      for (const t of TABLES) {
        setProgress(`Baixando ${t.label}…`);
        try {
          const rows = await fetchTableRows(t.name);
          dump[t.name] = rows;
          total += rows.length;
        } catch (err: any) {
          skipped.push(`${t.label}: ${err?.message ?? "sem acesso"}`);
          dump[t.name] = [];
        }
      }
      downloadJson(
        {
          version: 2,
          exported_at: new Date().toISOString(),
          total_records: total,
          tables: dump,
        },
        `backup-completo-${new Date().toISOString().slice(0, 10)}.json`,
      );
      if (skipped.length) {
        toast.success(`Backup gerado com ${total} registros. Sem acesso a: ${skipped.join(" | ")}`);
      } else {
        toast.success(`Backup completo gerado — ${total} registros`);
      }
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao exportar");
    } finally {
      setProgress(null);
      setExporting(false);
    }
  };

  const exportTable = async (table: string) => {
    try {
      const rows = await fetchTableRows(table);
      downloadJson(rows, `${table}-${new Date().toISOString().slice(0, 10)}.json`);
      toast.success(`${table} exportado — ${rows.length} registros`);
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao exportar");
    }
  };

  const importAll = async (file: File) => {
    if (!confirm("Importar irá ADICIONAR/ATUALIZAR os registros do arquivo no banco atual (sem apagar nada). Deseja continuar?")) return;
    setImporting(true);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const tables: Record<string, any[]> = parsed.tables ?? parsed;
      let totalOk = 0;
      const errors: string[] = [];
      for (const t of TABLES) {
        const rows = tables[t.name];
        if (!Array.isArray(rows) || rows.length === 0) continue;
        setProgress(`Importando ${t.label}…`);
        // Envia em lotes para não estourar o limite da requisição.
        for (let i = 0; i < rows.length; i += 500) {
          const chunk = rows.slice(i, i + 500);
          const { error } = await supabase
            .from(t.name as any)
            .upsert(chunk as any, { onConflict: t.conflict });
          if (error) {
            errors.push(`${t.label}: ${error.message}`);
            break;
          }
          totalOk += chunk.length;
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
      setProgress(null);
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  if (adminCheck.isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!adminCheck.data) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader><CardTitle>Acesso negado</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">Backup e restauração são restritos a administradores.</p>
            <Button className="w-full" onClick={() => navigate({ to: "/dashboard" })}>Voltar ao Dashboard</Button>
          </CardContent>
        </Card>
      </div>
    );
  }
  return (
    <div className="space-y-6">
      <PageHero
        eyebrow="Sistema"
        title="Backup e Restauração"
        description="Baixe um arquivo único com tudo e restaure quando precisar"
      />

      <Card className="border-border/50" style={{ boxShadow: "var(--shadow-card)" }}>
        <CardHeader>
          <CardTitle>Backup completo</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Gera um arquivo JSON único com tudo desde o princípio: clientes, vendas, ordens de serviço e seu
            histórico, alterações, minutagem de vídeo, notas fiscais, comprovantes, despesas, caixa, comissões
            (vendedores, produtores e metas), pastas e arquivos de projeto, Operação de Meta, WhatsApp e
            follow-up, fluxos de conversa, usuários, permissões, planos, personalização visual e logs.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button onClick={exportAll} disabled={exporting || importing}>
              {exporting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
              Baixar backup completo
            </Button>
            <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={importing || exporting}>
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
          {progress && <p className="text-xs text-muted-foreground">{progress}</p>}
          <p className="text-xs text-muted-foreground">
            A importação faz upsert por chave — registros existentes são atualizados e novos são inseridos. Nada é apagado.
            Senhas e chaves de integração não entram no arquivo por segurança.
          </p>
        </CardContent>
      </Card>

      <div>
        <h2 className="text-xl font-semibold mb-3">Exportar tabelas individuais</h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {TABLES.map((t) => (
            <Card key={t.name} className="border-border/50" style={{ boxShadow: "var(--shadow-card)" }}>
              <CardHeader><CardTitle className="text-base">{t.label}</CardTitle></CardHeader>
              <CardContent>
                <Button variant="outline" className="w-full" onClick={() => exportTable(t.name)}>
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
