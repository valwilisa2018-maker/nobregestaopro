import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { runStageAutomations } from "@/lib/pipeline-automations.functions";
import { PageShell } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Kanban, Plus, Loader2, Search, Download } from "lucide-react";
import { toast } from "sonner";
import { KanbanBoard } from "@/components/pipeline/kanban-board";
import { DealDrawer } from "@/components/pipeline/deal-drawer";
import { PipelineStats } from "@/components/pipeline/pipeline-stats";
import { Deal, Stage, PRIORITY_LABEL, Priority } from "@/components/pipeline/types";
import { TutorialVideo } from "@/components/tutorial-video";

export const Route = createFileRoute("/_authenticated/pipeline")({
  head: () => ({ meta: [{ title: "Pipeline CRM — Plataforma IA WhatsApp" }] }),
  component: PipelinePage,
});

function PipelinePage() {
  const runAutomations = useServerFn(runStageAutomations);
  const [stages, setStages] = useState<Stage[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<Deal | null>(null);
  const [createStage, setCreateStage] = useState<string | undefined>();

  const [search, setSearch] = useState("");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [importing, setImporting] = useState(false);

  const load = async () => {
    setLoading(true);
    await supabase.rpc("ensure_default_pipeline_stages");
    const [{ data: st }, { data: dl }] = await Promise.all([
      supabase.from("pipeline_stages" as never).select("*").order("position"),
      supabase.from("pipeline_deals" as never).select("*").order("created_at", { ascending: false }),
    ]);
    setStages((st as never) || []);
    setDeals((dl as never) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const importContacts = async () => {
    if (importing) return;
    setImporting(true);
    try {
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes.user?.id;
      if (!uid) { toast.error("Sessão expirada"); return; }
      const firstStage = [...stages].sort((a, b) => a.position - b.position)[0];
      if (!firstStage) { toast.error("Nenhuma etapa disponível"); return; }

      const [{ data: contacts }, { data: existing }] = await Promise.all([
        supabase.from("contacts").select("id,name,phone,tags,source,notes").eq("user_id", uid),
        supabase.from("pipeline_deals" as never).select("phone,whatsapp").eq("user_id", uid),
      ]);
      if (!contacts || contacts.length === 0) { toast.info("Nenhum contato para importar"); return; }

      const existingPhones = new Set<string>();
      ((existing as Array<{ phone: string | null; whatsapp: string | null }>) || []).forEach((d) => {
        [d.phone, d.whatsapp].forEach((p) => { if (p) existingPhones.add(String(p).replace(/\D+/g, "")); });
      });

      const rows = contacts
        .filter((c) => c.phone && !existingPhones.has(String(c.phone).replace(/\D+/g, "")))
        .map((c) => ({
          user_id: uid,
          stage_id: firstStage.id,
          title: c.name || c.phone,
          phone: c.phone,
          whatsapp: c.phone,
          tags: (c.tags as string[] | null) || [],
          source: (c.source as string | null) || "contatos",
          notes: (c.notes as string | null) || null,
          priority: "medium" as const,
          value_cents: 0,
          links: {},
          checklist: [],
        }));

      if (rows.length === 0) { toast.info("Todos os contatos já estão no pipeline"); return; }

      const { error } = await supabase.from("pipeline_deals" as never).insert(rows as never);
      if (error) { toast.error(error.message); return; }
      toast.success(`${rows.length} contato(s) importado(s) para o pipeline`);
      await load();
    } finally {
      setImporting(false);
    }
  };

  const openCreate = (stageId?: string) => {
    setEditing(null);
    setCreateStage(stageId || stages[0]?.id);
    setDrawerOpen(true);
  };

  const openEdit = (deal: Deal) => {
    setEditing(deal);
    setDrawerOpen(true);
  };

  const move = async (dealId: string, toStageId: string) => {
    const deal = deals.find((d) => d.id === dealId);
    if (!deal) return;
    const fromStageId = deal.stage_id;
    const toStage = stages.find((s) => s.id === toStageId);

    // optimistic
    setDeals((prev) => prev.map((d) => (d.id === dealId ? { ...d, stage_id: toStageId } : d)));

    const patch: Record<string, unknown> = { stage_id: toStageId };

    const { error } = await supabase.from("pipeline_deals" as never).update(patch as never).eq("id", dealId);
    if (error) {
      toast.error(error.message);
      setDeals((prev) => prev.map((d) => (d.id === dealId ? { ...d, stage_id: fromStageId } : d)));
      return;
    }
    if (toStage?.is_lost) {
      toast.info("Cartão movido para Perdido — informe o motivo.");
      const updated = { ...deal, stage_id: toStageId };
      setEditing(updated);
      setDrawerOpen(true);
    } else {
      toast.success(`Movido para ${toStage?.name}`);
    }

    // Automações da etapa (WhatsApp, lembrete, tarefa, histórico)
    try {
      const res = await runAutomations({ data: { dealId, fromStageId, toStageId } });
      if (res?.ran?.length) {
        const map: Record<string, string> = {
          whatsapp_sent: "WhatsApp enviado",
          whatsapp_failed: "WhatsApp falhou",
          reminder: "Lembrete agendado",
          email_queued: "E-mail registrado",
          task_created: "Tarefa criada",
        };
        const labels = res.ran.map((r) => map[r] || r).join(" • ");
        toast.message("Automações", { description: labels });
        // Recarrega para refletir next_contact_at atualizado
        load();
      }
    } catch (e) {
      console.error("stage automations", e);
    }
  };

  const filteredDeals = useMemo(() => {
    const q = search.trim().toLowerCase();
    return deals.filter((d) => {
      if (priorityFilter !== "all" && d.priority !== priorityFilter) return false;
      if (sourceFilter !== "all" && d.source !== sourceFilter) return false;
      if (!q) return true;
      return [d.title, d.company, d.email, d.phone, d.whatsapp, d.product, ...(d.tags || [])]
        .some((v) => v && String(v).toLowerCase().includes(q));
    });
  }, [deals, search, priorityFilter, sourceFilter]);

  const sources = useMemo(
    () => Array.from(new Set(deals.map((d) => d.source).filter(Boolean) as string[])),
    [deals],
  );

  return (
    <PageShell
      title="Pipeline CRM"
      description="Acompanhe a jornada do cliente do primeiro contato ao pós-venda."
      icon={<Kanban className="h-6 w-6" />}
      status="ativo"
      actions={
        <div className="flex gap-2">
          <Button variant="outline" onClick={importContacts} disabled={importing || loading}>
            {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Importar Contatos
          </Button>
          <Button onClick={() => openCreate()}>
            <Plus className="h-4 w-4" /> Novo Cartão
          </Button>
        </div>
      }
    >
      {loading ? (
        <div className="flex justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : (
        <div className="space-y-4">
          <TutorialVideo moduleKey="pipeline" title="Como usar o Pipeline CRM" />
          <PipelineStats deals={deals} stages={stages} />

          <div className="flex flex-wrap gap-2 items-center">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar por nome, empresa, e-mail, telefone…"
                value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
            </div>
            <Select value={priorityFilter} onValueChange={setPriorityFilter}>
              <SelectTrigger className="w-[150px]"><SelectValue placeholder="Prioridade" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas prioridades</SelectItem>
                {(Object.keys(PRIORITY_LABEL) as Priority[]).map((p) =>
                  <SelectItem key={p} value={p}>{PRIORITY_LABEL[p]}</SelectItem>
                )}
              </SelectContent>
            </Select>
            {sources.length > 0 && (
              <Select value={sourceFilter} onValueChange={setSourceFilter}>
                <SelectTrigger className="w-[150px]"><SelectValue placeholder="Origem" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas origens</SelectItem>
                  {sources.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
          </div>

          <KanbanBoard
            stages={stages}
            deals={filteredDeals}
            onOpenDeal={openEdit}
            onCreateInStage={openCreate}
            onMove={move}
          />
        </div>
      )}

      <DealDrawer
        open={drawerOpen}
        onClose={() => { setDrawerOpen(false); setEditing(null); }}
        deal={editing}
        stages={stages}
        defaultStageId={createStage}
        onSaved={load}
      />
    </PageShell>
  );
}