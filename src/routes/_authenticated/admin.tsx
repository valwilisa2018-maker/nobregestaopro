import { createFileRoute } from "@tanstack/react-router";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { CheckCircle2, AlertCircle, AlertTriangle, Loader2, Pencil, Trash2, Bell, Megaphone, Plus, Info, Zap, Activity } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { PagarmeCredentialCard } from "@/components/pagarme-credential-card";
import { format } from "date-fns";
import {
  useLoopDuplicateThreshold,
  TELAO_THRESHOLD_DEFAULT,
  TELAO_THRESHOLD_MIN,
  TELAO_THRESHOLD_MAX,
  useBigSellerOverlaySeconds,
  TELAO_OVERLAY_DEFAULT,
  TELAO_OVERLAY_MIN,
  TELAO_OVERLAY_MAX,
} from "@/hooks/use-telao-settings";
import { useCelebrationSettings } from "@/hooks/use-celebration-settings";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { SystemLogsTable } from "@/components/system-logs";
import { SystemHealthDashboard } from "@/components/system-health";

export const Route = createFileRoute("/_authenticated/admin")({
  component: AdminPage,
});

const PERIOD_LABEL: Record<string, string> = {
  daily: "Diária",
  weekly: "Semanal",
  monthly: "Mensal",
  yearly: "Anual",
};

function AdminPage() {
  const navigate = useNavigate();
  const PASS_KEY = "admin_settings_password";
  const SESSION_KEY = "admin_settings_unlocked";
  const [unlocked, setUnlocked] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return sessionStorage.getItem(SESSION_KEY) === "1";
  });
  const [pwdInput, setPwdInput] = useState("");
  const [curPwd, setCurPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [newPwd2, setNewPwd2] = useState("");
  const getStoredPwd = () =>
    (typeof window !== "undefined" && localStorage.getItem(PASS_KEY)) || "admin";
  const tryUnlock = () => {
    if (pwdInput === getStoredPwd()) {
      sessionStorage.setItem(SESSION_KEY, "1");
      setUnlocked(true);
      setPwdInput("");
    } else {
      toast.error("Senha incorreta");
    }
  };
  const pwdChecks = {
    length: newPwd.length >= 8,
    upper: /[A-Z]/.test(newPwd),
    lower: /[a-z]/.test(newPwd),
    number: /[0-9]/.test(newPwd),
    symbol: /[^A-Za-z0-9]/.test(newPwd),
  };
  const pwdValid = Object.values(pwdChecks).every(Boolean);
  const pwdMatch = newPwd.length > 0 && newPwd === newPwd2;
  const changePwd = () => {
    if (curPwd !== getStoredPwd()) { toast.error("Senha atual incorreta"); return; }
    if (!pwdValid) { toast.error("A nova senha não atende aos requisitos de complexidade"); return; }
    if (newPwd === curPwd) { toast.error("A nova senha deve ser diferente da atual"); return; }
    if (!pwdMatch) { toast.error("A confirmação não coincide com a nova senha"); return; }
    localStorage.setItem(PASS_KEY, newPwd);
    setCurPwd(""); setNewPwd(""); setNewPwd2("");
    toast.success("Senha alterada com sucesso");
  };
  const qc = useQueryClient();
  const goals = useQuery({ queryKey: ["admin-goals"], queryFn: async () => (await supabase.from("goals").select("*").is("seller_id", null)).data ?? [] });
  const services = useQuery({ queryKey: ["admin-services"], queryFn: async () => (await supabase.from("service_types").select("*").order("sort_order")).data ?? [] });
  const cols = useQuery({ queryKey: ["admin-cols"], queryFn: async () => (await supabase.from("kanban_columns").select("*").order("sort_order")).data ?? [] });
  const sellers = useQuery({ queryKey: ["admin-sellers"], queryFn: async () => (await supabase.from("sellers").select("*").order("name")).data ?? [] });
  const [newService, setNewService] = useState("");
  const [newCol, setNewCol] = useState("");
  const [newSeller, setNewSeller] = useState({ name: "", email: "", phone: "", commission_rate: "", monthly_goal: "" });
  const packages = useQuery({ queryKey: ["admin-packages"], queryFn: async () => (await supabase.from("packages").select("*").order("name")).data ?? [] });
  const [newPkg, setNewPkg] = useState({ name: "", default_price: "" });
  const addPackage = async () => {
    const nameTrim = newPkg.name.trim() || `Pacote ${new Date().toLocaleDateString("pt-BR")}`;
    const { error } = await supabase.from("packages").insert({
      name: nameTrim,
      quantity: 1,
      default_price: Number(newPkg.default_price || 0),
      active: true,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Pacote cadastrado");
    setNewPkg({ name: "", default_price: "" });
    qc.invalidateQueries({ queryKey: ["admin-packages"] });
    qc.invalidateQueries({ queryKey: ["pkg-all"] });
  };
  const togglePackage = async (id: string, active: boolean) => {
    const { error } = await supabase.from("packages").update({ active: !active }).eq("id", id);
    if (error) toast.error(error.message);
    else { qc.invalidateQueries({ queryKey: ["admin-packages"] }); qc.invalidateQueries({ queryKey: ["pkg-all"] }); }
  };
  const [editPkg, setEditPkg] = useState<{ id: string; name: string; default_price: string } | null>(null);
  const saveEditPackage = async () => {
    if (!editPkg) return;
    const { error } = await supabase.from("packages").update({
      name: editPkg.name.trim() || "Pacote",
      default_price: Number(editPkg.default_price || 0),
    }).eq("id", editPkg.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Pacote atualizado");
    setEditPkg(null);
    qc.invalidateQueries({ queryKey: ["admin-packages"] });
    qc.invalidateQueries({ queryKey: ["pkg-all"] });
  };
  const deletePackage = async (id: string, name: string) => {
    if (!confirm(`Excluir o pacote "${name}"? Esta ação não pode ser desfeita.`)) return;
    const { error } = await supabase.from("packages").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Pacote excluído");
    qc.invalidateQueries({ queryKey: ["admin-packages"] });
    qc.invalidateQueries({ queryKey: ["pkg-all"] });
  };

  const updateGoal = async (id: string, amount: string, period: string) => {
    const numericAmount = Math.max(0, Number(amount));
    
    console.log(`Updating goal ${id} for period ${period} to ${numericAmount}`);

    const { error } = await supabase.from("goals").update({ 
      target_amount: Number(numericAmount.toFixed(2)) 
    }).eq("id", id);

    if (error) {
      console.error("Supabase update error:", error);
      toast.error(error.message);
    } else {
      // Synchronize other goals based on the updated one with rounding
      let daily = 0;
      if (period === "daily") daily = numericAmount;
      else if (period === "weekly") daily = numericAmount / 7;
      else if (period === "monthly") daily = numericAmount / 30;
      else if (period === "yearly") daily = numericAmount / 365;

      const updates = [
        { p: "daily", val: Number(daily.toFixed(2)) },
        { p: "weekly", val: Number((daily * 7).toFixed(2)) },
        { p: "monthly", val: Number((daily * 30).toFixed(2)) },
        { p: "yearly", val: Number((daily * 365).toFixed(2)) },
      ];

      try {
        const syncPromises = updates
          .filter(u => u.p !== period)
          .map(update => {
            const targetGoal = goals.data?.find((g: any) => g.period === update.p);
            if (targetGoal) {
              return supabase.from("goals")
                .update({ target_amount: update.val })
                .eq("id", targetGoal.id);
            }
            return Promise.resolve({ error: null });
          });

        const results = await Promise.all(syncPromises);
        const firstError = results.find(r => r.error)?.error;
        
        if (firstError) {
          toast.error("Erro ao sincronizar algumas metas: " + firstError.message);
        } else {
          toast.success("Metas sincronizadas com precisão");
        }
      } catch (err) {
        console.error("Sync error:", err);
        toast.error("Erro inesperado na sincronização");
      }

      qc.invalidateQueries({ queryKey: ["admin-goals"] });
    }
  };
  const addService = async () => {
    if (!newService) return;
    const { error } = await supabase.from("service_types").insert({ name: newService, sort_order: 999 });
    if (error) toast.error(error.message); else { toast.success("Tipo de serviço criado"); setNewService(""); qc.invalidateQueries(); }
  };
  const [editService, setEditService] = useState<{ id: string; name: string } | null>(null);
  const saveEditService = async () => {
    if (!editService) return;
    const { error } = await supabase.from("service_types").update({ name: editService.name.trim() || "Tipo" }).eq("id", editService.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Tipo atualizado");
    setEditService(null);
    qc.invalidateQueries({ queryKey: ["admin-services"] });
  };
  const toggleServiceActive = async (id: string, active: boolean) => {
    const { error } = await supabase.from("service_types").update({ active: !active }).eq("id", id);
    if (error) toast.error(error.message);
    else qc.invalidateQueries({ queryKey: ["admin-services"] });
  };
  const deleteService = async (id: string, name: string) => {
    const { count } = await supabase.from("sales").select("id", { count: "exact", head: true }).eq("service_type_id", id);
    if ((count ?? 0) > 0) {
      toast.error(`Não é possível excluir: ${count} ordem(ns) usam este tipo. Considere desativar.`);
      return;
    }
    if (!window.confirm(`Excluir o tipo "${name}"?`)) return;
    const { error } = await supabase.from("service_types").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Tipo excluído");
    qc.invalidateQueries({ queryKey: ["admin-services"] });
  };
  const addCol = async () => {
    if (!newCol) return;
    const max = Math.max(...(cols.data ?? []).map((c: any) => c.sort_order ?? 0), 0);
    const { error } = await supabase.from("kanban_columns").insert({ name: newCol, sort_order: max + 10 });
    if (error) toast.error(error.message); else { toast.success("Coluna criada"); setNewCol(""); qc.invalidateQueries(); }
  };
  const [editCol, setEditCol] = useState<{ id: string; name: string; color: string; sort_order: number } | null>(null);
  const saveEditCol = async () => {
    if (!editCol) return;
    const { error } = await supabase.from("kanban_columns").update({
      name: editCol.name.trim() || "Coluna",
      color: editCol.color,
      sort_order: Number(editCol.sort_order) || 0,
    }).eq("id", editCol.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Coluna atualizada");
    setEditCol(null);
    qc.invalidateQueries({ queryKey: ["admin-cols"] });
    qc.invalidateQueries({ queryKey: ["kanban-cols"] });
  };
  const deleteCol = async (id: string, name: string) => {
    const { count } = await supabase.from("service_orders").select("id", { count: "exact", head: true }).eq("column_id", id);
    if ((count ?? 0) > 0) {
      toast.error(`Não é possível excluir: ${count} card(s) nesta coluna. Mova-os antes.`);
      return;
    }
    if (!window.confirm(`Excluir a coluna "${name}"?`)) return;
    const { error } = await supabase.from("kanban_columns").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Coluna excluída");
    qc.invalidateQueries({ queryKey: ["admin-cols"] });
    qc.invalidateQueries({ queryKey: ["kanban-cols"] });
  };
  const updateCommission = async (id: string, rate: string) => {
    const value = Number(rate);
    if (isNaN(value) || value < 0 || value > 100) { toast.error("Informe um percentual entre 0 e 100"); return; }
    const { error } = await supabase.from("sellers").update({ commission_rate: value }).eq("id", id);
    if (error) toast.error(error.message); else { toast.success("Comissão atualizada"); qc.invalidateQueries(); }
  };
  const updateSellerGoal = async (id: string, amount: string) => {
    const { error } = await supabase.from("sellers").update({ monthly_goal: Number(amount) }).eq("id", id);
    if (error) toast.error(error.message); else { toast.success("Meta atualizada"); qc.invalidateQueries(); }
  };
  const addSeller = async () => {
    if (!newSeller.name.trim()) { toast.error("Informe o nome do vendedor"); return; }
    const { error } = await supabase.from("sellers").insert({
      name: newSeller.name.trim(),
      email: newSeller.email.trim() || null,
      phone: newSeller.phone.trim() || null,
      commission_rate: Number(newSeller.commission_rate || 0),
      monthly_goal: Number(newSeller.monthly_goal || 0),
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Vendedor cadastrado");
    setNewSeller({ name: "", email: "", phone: "", commission_rate: "", monthly_goal: "" });
    qc.invalidateQueries({ queryKey: ["admin-sellers"] });
    qc.invalidateQueries({ queryKey: ["sellers-page"] });
  };
  const toggleSellerActive = async (id: string, active: boolean) => {
    const { error } = await supabase.from("sellers").update({ active }).eq("id", id);
    if (error) toast.error(error.message); else { toast.success(active ? "Vendedor ativado" : "Vendedor desativado"); qc.invalidateQueries(); }
  };
  const deleteSeller = async (id: string, name: string) => {
    if (!window.confirm(`Excluir o vendedor "${name}"? Esta ação não pode ser desfeita.`)) return;
    const { count } = await supabase.from("sales").select("id", { count: "exact", head: true }).eq("seller_id", id);
    if ((count ?? 0) > 0) {
      toast.error(`Não é possível excluir: ${count} venda(s) vinculadas. Desative-o em vez disso.`);
      return;
    }
    const { error } = await supabase.from("sellers").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Vendedor excluído"); qc.invalidateQueries({ queryKey: ["admin-sellers"] }); qc.invalidateQueries({ queryKey: ["sellers-page"] }); }
  };

  if (!unlocked) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Acesso às Configurações</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">Área restrita — somente administradores.</p>
          </CardHeader>
          <CardContent className="space-y-3">
            <Label>Senha</Label>
            <Input
              type="password"
              autoFocus
              value={pwdInput}
              onChange={(e) => setPwdInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") tryUnlock(); }}
              placeholder="Digite a senha"
            />
            <Button className="w-full" onClick={tryUnlock}>Entrar</Button>
            <Button variant="outline" className="w-full" onClick={() => navigate({ to: "/dashboard" })}>Voltar</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div><h1 className="text-3xl font-bold tracking-tight">Configurações</h1><p className="text-muted-foreground">Painel administrativo</p></div>
        <Button variant="outline" size="sm" onClick={() => { sessionStorage.removeItem(SESSION_KEY); setUnlocked(false); }}>Bloquear</Button>
      </div>
      <Tabs defaultValue="goals">
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="health">
            <Activity className="w-4 h-4 mr-2" /> Saúde
          </TabsTrigger>
          <TabsTrigger value="goals">Metas</TabsTrigger>
          <TabsTrigger value="commissions">Comissões</TabsTrigger>
          <TabsTrigger value="services">Tipos de Serviço</TabsTrigger>
          <TabsTrigger value="kanban">Colunas Kanban</TabsTrigger>
          <TabsTrigger value="packages">Pacotes</TabsTrigger>
          <TabsTrigger value="announcements">
            <Bell className="w-4 h-4 mr-2" /> Avisos
          </TabsTrigger>
          <TabsTrigger value="pagarme">Pagar.me</TabsTrigger>
          <TabsTrigger value="nfe">Nota Fiscal</TabsTrigger>
          <TabsTrigger value="telao">Telão</TabsTrigger>
          <TabsTrigger value="senha">Senha</TabsTrigger>
          <TabsTrigger value="reset" className="text-destructive">Resetar</TabsTrigger>
          <TabsTrigger value="logs">
            <Zap className="w-4 h-4 mr-2" /> Logs
          </TabsTrigger>
          <TabsTrigger value="audit">Auditoria</TabsTrigger>
        </TabsList>

        <TabsContent value="health" className="mt-4">
          <SystemHealthDashboard />
        </TabsContent>

        <TabsContent value="announcements" className="mt-4">
          <AnnouncementsTab />
        </TabsContent>

        <TabsContent value="logs" className="mt-4">
          <SystemLogsTable />
        </TabsContent>

        <TabsContent value="goals" className="space-y-3 mt-4">
          {(goals.data ?? [])
            .sort((a: any, b: any) => {
              const order = ["daily", "weekly", "monthly", "yearly"];
              return order.indexOf(a.period) - order.indexOf(b.period);
            })
            .map((g: any) => (
              <Card key={g.id} className="border-border/50">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="w-32 font-medium">{PERIOD_LABEL[g.period] ?? g.period}</div>
                  <Input 
                    type="number" 
                    defaultValue={g.target_amount} 
                    key={`${g.id}-${g.target_amount}`}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        (e.target as HTMLInputElement).blur();
                      }
                    }}
                    onBlur={(e) => updateGoal(g.id, e.target.value, g.period)} 
                    className="max-w-xs" 
                  />
                  <span className="text-xs text-muted-foreground">Salva automaticamente ao sair do campo</span>
                </CardContent>
              </Card>
            ))}
        </TabsContent>

        <TabsContent value="commissions" className="space-y-3 mt-4">
          <Card className="border-border/50">
            <CardHeader>
              <CardTitle className="text-base">Cadastrar vendedor</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-2 md:grid-cols-[1.4fr_1.4fr_1fr_110px_140px_auto] md:items-end">
                <div className="space-y-1">
                  <Label className="text-xs">Nome</Label>
                  <Input value={newSeller.name} onChange={(e) => setNewSeller({ ...newSeller, name: e.target.value })} placeholder="Nome completo" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">E-mail</Label>
                  <Input value={newSeller.email} onChange={(e) => setNewSeller({ ...newSeller, email: e.target.value })} placeholder="email@exemplo.com" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Telefone</Label>
                  <Input value={newSeller.phone} onChange={(e) => setNewSeller({ ...newSeller, phone: e.target.value })} placeholder="(00) 00000-0000" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Comissão (%)</Label>
                  <Input type="number" step="0.1" min="0" max="100" value={newSeller.commission_rate} onChange={(e) => setNewSeller({ ...newSeller, commission_rate: e.target.value })} placeholder="0" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Meta mensal (R$)</Label>
                  <Input type="number" value={newSeller.monthly_goal} onChange={(e) => setNewSeller({ ...newSeller, monthly_goal: e.target.value })} placeholder="0" />
                </div>
                <Button onClick={addSeller}>Adicionar</Button>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/50">
            <CardHeader>
              <CardTitle className="text-base">Comissão por vendedor</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Edite o percentual de comissão (%) sobre o valor das vendas e a meta mensal de cada vendedor.
              </p>
              {(sellers.data ?? []).length === 0 && (
                <div className="p-4 rounded-lg border border-dashed border-border text-sm text-muted-foreground text-center">
                  Nenhum vendedor cadastrado ainda — use o formulário acima para adicionar o primeiro.
                </div>
              )}
              {(sellers.data ?? []).map((s: any) => (
                <div key={s.id} className="p-3 rounded-lg border border-border/50 bg-card grid gap-3 md:grid-cols-[1fr_140px_180px_110px] md:items-center">
                  <div>
                    <div className="font-medium">{s.name}</div>
                    {s.email && <div className="text-xs text-muted-foreground">{s.email}</div>}
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Comissão (%)</Label>
                    <Input
                      type="number"
                      step="0.1"
                      min="0"
                      max="100"
                      defaultValue={s.commission_rate ?? 0}
                      onBlur={(e) => updateCommission(s.id, e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Meta mensal (R$)</Label>
                    <Input
                      type="number"
                      defaultValue={s.monthly_goal ?? 0}
                      onBlur={(e) => updateSellerGoal(s.id, e.target.value)}
                    />
                  </div>
                  <div className="flex gap-1">
                    <Button variant={s.active ? "outline" : "default"} size="sm" onClick={() => toggleSellerActive(s.id, !s.active)}>
                      {s.active ? "Desativar" : "Ativar"}
                    </Button>
                    <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => deleteSeller(s.id, s.name)}>
                      Excluir
                    </Button>
                  </div>
                </div>
              ))}
              <div className="text-xs text-muted-foreground">Salva automaticamente ao sair do campo.</div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="services" className="mt-4 space-y-3">
          <Card className="border-border/50"><CardHeader><CardTitle className="text-base">Adicionar novo tipo</CardTitle></CardHeader>
            <CardContent className="flex gap-2">
              <Input placeholder="Ex.: Motion Design" value={newService} onChange={(e) => setNewService(e.target.value)} />
              <Button onClick={addService}>Adicionar</Button>
            </CardContent>
          </Card>
          <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
            {(services.data ?? []).map((s: any) => (
              <div key={s.id} className="p-3 rounded-lg border border-border/50 bg-card flex items-center gap-2">
                {editService && editService.id === s.id ? (
                  <>
                    <Input
                      value={editService.name}
                      onChange={(e) => setEditService({ ...editService, name: e.target.value })}
                      onKeyDown={(e) => { if (e.key === "Enter") saveEditService(); if (e.key === "Escape") setEditService(null); }}
                      autoFocus
                      className="h-8"
                    />
                    <Button size="sm" onClick={saveEditService}>Salvar</Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditService(null)}>Cancelar</Button>
                  </>
                ) : (
                  <>
                    <span className="flex-1 truncate">{s.name}</span>
                    <button
                      onClick={() => toggleServiceActive(s.id, s.active)}
                      className={`text-xs px-2 py-0.5 rounded ${s.active ? "text-emerald-600" : "text-muted-foreground"}`}
                      title="Alternar ativo/inativo"
                    >
                      {s.active ? "Ativo" : "Inativo"}
                    </button>
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditService({ id: s.id, name: s.name })}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => deleteService(s.id, s.name)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </>
                )}
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="kanban" className="mt-4 space-y-3">
          <Card className="border-border/50"><CardHeader><CardTitle className="text-base">Adicionar coluna</CardTitle></CardHeader>
            <CardContent className="flex gap-2">
              <Input placeholder="Ex.: Aguardando Cliente" value={newCol} onChange={(e) => setNewCol(e.target.value)} />
              <Button onClick={addCol}>Adicionar</Button>
            </CardContent>
          </Card>
          <div className="grid gap-2">
            {(cols.data ?? []).map((c: any) => (
              <div key={c.id} className="p-3 rounded-lg border border-border/50 bg-card flex items-center gap-3">
                {editCol && editCol.id === c.id ? (() => {
                  const ec = editCol!;
                  return (
                  <>
                    <input
                      type="color"
                      value={ec.color || "#ef4444"}
                      onChange={(e) => setEditCol({ ...ec, color: e.target.value })}
                      className="h-8 w-10 rounded border border-border/50 bg-transparent"
                    />
                    <Input
                      value={ec.name}
                      onChange={(e) => setEditCol({ ...ec, name: e.target.value })}
                      className="flex-1"
                    />
                    <Input
                      type="number"
                      value={ec.sort_order}
                      onChange={(e) => setEditCol({ ...ec, sort_order: Number(e.target.value) })}
                      className="w-24"
                    />
                    <Button size="sm" onClick={saveEditCol}>Salvar</Button>
                    <Button size="sm" variant="outline" onClick={() => setEditCol(null)}>Cancelar</Button>
                  </>
                  );
                })() : (
                  <>
                    <span className="w-3 h-3 rounded-full" style={{ background: c.color }} />
                    <span className="flex-1">{c.name}</span>
                    <span className="text-xs text-muted-foreground">Ordem {c.sort_order}</span>
                    <Button size="icon" variant="ghost" onClick={() => setEditCol({ id: c.id, name: c.name, color: c.color || "#ef4444", sort_order: c.sort_order ?? 0 })}>
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button size="icon" variant="ghost" className="text-destructive" onClick={() => deleteCol(c.id, c.name)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </>
                )}
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="pagarme" className="mt-4 space-y-3">
          <PagarmeCredentialCard />

          <Card
            className="border-2"
            style={{
              background: "#ffffff",
              borderColor: "#86efac",
              color: "#0a0a0a",
              boxShadow: "0 8px 28px -12px rgba(22,163,74,0.35)",
            }}
          >
            <CardHeader
              className="rounded-t-xl"
              style={{ background: "linear-gradient(135deg, #16a34a, #15803d)" }}
            >
              <CardTitle className="text-base text-white">Integração Pagar.me</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm pt-4">
              <p className="text-neutral-700">
                Cadastre a chave secreta no card acima. A credencial fica salva com segurança
                e o menu <strong style={{ color: "#15803d" }}>Gerar Pagamento</strong> passa
                a funcionar imediatamente.
              </p>
              <ol className="list-decimal list-inside space-y-1 text-neutral-700">
                <li>Acesse o painel da Pagar.me → Configurações → Chaves de API.</li>
                <li>Copie a <strong>Secret Key</strong> (começa com <code>sk_</code>).</li>
                <li>Cole no card <strong style={{ color: "#15803d" }}>Credencial Pagar.me</strong> acima e clique em Salvar.</li>
              </ol>
              <div
                className="p-3 rounded-lg flex items-start gap-2"
                style={{ background: "#dcfce7", border: "1px solid #86efac" }}
              >
                <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" style={{ color: "#15803d" }} />
                <div style={{ color: "#15803d" }}>
                  <div className="font-semibold">Métodos suportados</div>
                  <div className="text-xs opacity-90">Cartão de Crédito (até 12x), Pix e Boleto.</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="packages" className="mt-4 space-y-3">
          <Card className="border-border/50"><CardHeader><CardTitle className="text-base">Adicionar pacote</CardTitle></CardHeader>
            <CardContent className="grid gap-2 md:grid-cols-3">
              <Input className="md:col-span-2" placeholder="Nome do pacote (opcional)" value={newPkg.name} onChange={(e) => setNewPkg({ ...newPkg, name: e.target.value })} />
              <Input type="number" step="0.01" placeholder="Preço sugerido (R$)" value={newPkg.default_price} onChange={(e) => setNewPkg({ ...newPkg, default_price: e.target.value })} />
              <Button className="md:col-span-3" onClick={addPackage}>Adicionar pacote</Button>
            </CardContent>
          </Card>
          <div className="grid gap-2">
            {(packages.data ?? []).map((p: any) => (
              <div key={p.id} className="p-3 rounded-lg border border-border/50 bg-card flex items-center gap-3">
                <span className="flex-1 font-medium">{p.name}</span>
                <span className="text-xs text-muted-foreground">R$ {Number(p.default_price ?? 0).toFixed(2)}</span>
                <Button size="sm" variant={p.active ? "outline" : "secondary"} onClick={() => togglePackage(p.id, p.active)}>
                  {p.active ? "Desativar" : "Ativar"}
                </Button>
                <Button size="icon" variant="ghost" onClick={() => setEditPkg({ id: p.id, name: p.name, default_price: String(p.default_price ?? 0) })}>
                  <Pencil className="w-4 h-4" />
                </Button>
                <Button size="icon" variant="ghost" onClick={() => deletePackage(p.id, p.name)}>
                  <Trash2 className="w-4 h-4 text-destructive" />
                </Button>
              </div>
            ))}
            {(packages.data ?? []).length === 0 && (
              <div className="text-sm text-muted-foreground p-4 text-center">Nenhum pacote cadastrado.</div>
            )}
          </div>
          {editPkg && (
            <Card className="border-border/50">
              <CardHeader><CardTitle className="text-base">Editar pacote</CardTitle></CardHeader>
              <CardContent className="grid gap-2 md:grid-cols-3">
                <Input className="md:col-span-2" placeholder="Nome do pacote" value={editPkg.name} onChange={(e) => setEditPkg({ ...editPkg, name: e.target.value })} />
                <Input type="number" step="0.01" placeholder="Preço sugerido (R$)" value={editPkg.default_price} onChange={(e) => setEditPkg({ ...editPkg, default_price: e.target.value })} />
                <div className="md:col-span-3 flex gap-2">
                  <Button onClick={saveEditPackage}>Salvar</Button>
                  <Button variant="outline" onClick={() => setEditPkg(null)}>Cancelar</Button>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="nfe" className="mt-4 space-y-3">
          <Card className="border-border/50">
            <CardHeader>
              <CardTitle className="text-base">API de Nota Fiscal</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <p className="text-muted-foreground">
                Em breve: emissão automática de NFS-e via API (NFE.io, Focus NFe, eNotas etc).
                Cadastre aqui o token da emissora escolhida para que cada venda gere a nota fiscal automaticamente.
              </p>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1">
                  <Label>Provedor</Label>
                  <Input placeholder="Ex.: NFE.io" disabled />
                </div>
                <div className="space-y-1">
                  <Label>Token da API</Label>
                  <Input type="password" placeholder="Será solicitado ao ativar" disabled />
                </div>
                <div className="space-y-1">
                  <Label>CNPJ Emissor</Label>
                  <Input placeholder="00.000.000/0000-00" disabled />
                </div>
                <div className="space-y-1">
                  <Label>Inscrição Municipal</Label>
                  <Input placeholder="Opcional" disabled />
                </div>
              </div>
              <div className="p-3 rounded-lg border border-border/50 bg-muted/30 text-xs text-muted-foreground">
                Estrutura pronta — aguardando credenciais e escolha do provedor para ativar a emissão.
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="telao" className="mt-4 space-y-3">
          <TelaoSettingsTab />
          <TelaoOverlayDurationCard />
          <CelebrationSettingsCard />
        </TabsContent>

        <TabsContent value="senha" className="mt-4 space-y-3">
          <Card>
            <CardHeader><CardTitle>Alterar senha de acesso</CardTitle></CardHeader>
            <CardContent className="space-y-3 max-w-md">
              <div className="space-y-1">
                <Label>Senha atual</Label>
                <Input type="password" value={curPwd} onChange={(e) => setCurPwd(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Nova senha</Label>
                <Input type="password" value={newPwd} onChange={(e) => setNewPwd(e.target.value)} />
              </div>
              <ul className="text-xs space-y-1 rounded-md border p-3 bg-muted/30">
                <li className={pwdChecks.length ? "text-green-600" : "text-muted-foreground"}>• Mínimo de 8 caracteres</li>
                <li className={pwdChecks.upper ? "text-green-600" : "text-muted-foreground"}>• Pelo menos 1 letra maiúscula (A-Z)</li>
                <li className={pwdChecks.lower ? "text-green-600" : "text-muted-foreground"}>• Pelo menos 1 letra minúscula (a-z)</li>
                <li className={pwdChecks.number ? "text-green-600" : "text-muted-foreground"}>• Pelo menos 1 número (0-9)</li>
                <li className={pwdChecks.symbol ? "text-green-600" : "text-muted-foreground"}>• Pelo menos 1 símbolo (ex: !@#$%)</li>
              </ul>
              <div className="space-y-1">
                <Label>Confirmar nova senha</Label>
                <Input type="password" value={newPwd2} onChange={(e) => setNewPwd2(e.target.value)} />
                {newPwd2.length > 0 && (
                  <p className={`text-xs ${pwdMatch ? "text-green-600" : "text-destructive"}`}>
                    {pwdMatch ? "As senhas coincidem" : "As senhas não coincidem"}
                  </p>
                )}
              </div>
              <Button onClick={changePwd} disabled={!pwdValid || !pwdMatch || !curPwd}>Salvar nova senha</Button>
              <p className="text-xs text-muted-foreground">A senha é armazenada localmente neste navegador. Senha padrão inicial: <code>admin</code>.</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="reset" className="mt-4 space-y-3">
          <ResetPlatformTab />
        </TabsContent>

        <TabsContent value="audit" className="mt-4 space-y-3">
          <AuditLogTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ResetPlatformTab() {
  const qc = useQueryClient();
  const [confirmText, setConfirmText] = useState("");
  const [loading, setLoading] = useState(false);
  const PHRASE = "RESETAR TUDO";

  const handleReset = async () => {
    if (confirmText !== PHRASE) {
      toast.error(`Digite exatamente: ${PHRASE}`);
      return;
    }
    setLoading(true);
    try {
      // Executa via função SECURITY DEFINER no banco: bypassa RLS, valida admin
      // e respeita a ordem correta das dependências (sale_receipts, invoices,
      // service_orders, cash_movements, expenses, sales, packages, customers).
      const { error } = await supabase.rpc("admin_reset_platform");
      if (error) throw new Error(error.message);

      toast.success("Plataforma resetada com sucesso");
      setConfirmText("");
      qc.invalidateQueries();
    } catch (e: any) {
      toast.error(e.message ?? "Falha ao resetar");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="border-destructive/50">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2 text-destructive">
          <AlertTriangle className="w-5 h-5" />
          Zona de perigo — Resetar plataforma
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div className="p-3 rounded-lg border border-destructive/40 bg-destructive/5">
          <p className="font-medium text-destructive mb-2">
            Esta ação apaga PERMANENTEMENTE todos os dados operacionais:
          </p>
          <ul className="list-disc list-inside space-y-1 text-muted-foreground">
            <li>Clientes cadastrados</li>
            <li>Vendas registradas</li>
            <li>Ordens de serviço (Kanban)</li>
            <li>Notas fiscais</li>
            <li>Despesas e movimentações de caixa</li>
            <li>Pacotes</li>
          </ul>
          <p className="text-xs text-muted-foreground mt-2">
            Mantém: vendedores, produtores, tipos de serviço, colunas do kanban, metas e usuários.
            Faça um backup antes em "Becape".
          </p>
        </div>
        <div className="space-y-1">
          <Label>
            Digite <code className="px-1 bg-muted rounded">{PHRASE}</code> para confirmar
          </Label>
          <Input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={PHRASE}
            disabled={loading}
          />
        </div>
        <Button
          variant="destructive"
          onClick={handleReset}
          disabled={loading || confirmText !== PHRASE}
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Resetando...
            </>
          ) : (
            "Resetar plataforma"
          )}
        </Button>
      </CardContent>
    </Card>
  );
}

function AuditLogTab() {
  const logs = useQuery({
    queryKey: ["audit-logs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  const actionLabel = (a: string) =>
    a === "platform_reset" ? "Reset da plataforma" : a;

  return (
    <Card className="border-border/50">
      <CardHeader>
        <CardTitle className="text-base">Log de auditoria</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-muted-foreground">
          Histórico das últimas 200 ações sensíveis executadas na plataforma.
        </p>
        {logs.isLoading && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> Carregando...
          </div>
        )}
        {!logs.isLoading && (logs.data ?? []).length === 0 && (
          <div className="p-4 rounded-lg border border-dashed border-border text-muted-foreground text-center">
            Nenhum evento registrado ainda.
          </div>
        )}
        <div className="space-y-2">
          {(logs.data ?? []).map((l: any) => {
            const total = l.details?.total_deleted;
            const tables = l.details?.tables as Record<string, number> | undefined;
            return (
              <div key={l.id} className="p-3 rounded-lg border border-border/50 bg-card">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="font-medium">{actionLabel(l.action)}</div>
                  <div className="text-xs text-muted-foreground">
                    {format(new Date(l.created_at), "dd/MM/yyyy HH:mm:ss")}
                  </div>
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  Executado por: <strong>{l.performed_by_email ?? l.performed_by ?? "—"}</strong>
                </div>
                {typeof total === "number" && (
                  <div className="text-xs mt-2">
                    Total apagado: <strong>{total}</strong> registros
                  </div>
                )}
                {tables && (
                  <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-1 text-xs">
                    {Object.entries(tables).map(([t, n]) => (
                      <div key={t} className="px-2 py-1 rounded bg-muted/40">
                        <span className="text-muted-foreground">{t}: </span>
                        <strong>{n}</strong>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function AnnouncementsTab() {
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ title: "", message: "", type: "info", expires_at: "", is_active: true });
  
  const announcements = useQuery({
    queryKey: ["admin-announcements"],
    queryFn: async () => (await supabase.from("system_announcements").select("*").order("created_at", { ascending: false })).data ?? []
  });

  const save = async () => {
    if (!form.title || !form.message) return toast.error("Título e mensagem são obrigatórios");
    setSaving(true);
    try {
      const { error } = await supabase.from("system_announcements").insert({
        title: form.title,
        message: form.message,
        type: form.type as any,
        is_active: form.is_active,
        expires_at: form.expires_at || null,
      });
      if (error) throw error;
      toast.success("Aviso criado com sucesso");
      setForm({ title: "", message: "", type: "info", expires_at: "", is_active: true });
      qc.invalidateQueries({ queryKey: ["admin-announcements"] });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (id: string, active: boolean) => {
    const { error } = await supabase.from("system_announcements").update({ is_active: active }).eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success(active ? "Aviso ativado" : "Aviso desativado");
      qc.invalidateQueries({ queryKey: ["admin-announcements"] });
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Excluir este aviso?")) return;
    const { error } = await supabase.from("system_announcements").delete().eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success("Aviso excluído");
      qc.invalidateQueries({ queryKey: ["admin-announcements"] });
    }
  };

  return (
    <div className="space-y-6">
      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Plus className="w-4 h-4 text-primary" /> Novo Aviso Manual
          </CardTitle>
          <CardDescription>Crie comunicados, alertas de manutenção ou atualizações manuais para todos os usuários.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Título do Aviso</Label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Ex: Manutenção Programada" />
            </div>
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="info">Informação (Azul)</SelectItem>
                  <SelectItem value="update">Atualização (Verde)</SelectItem>
                  <SelectItem value="warning">Aviso (Laranja)</SelectItem>
                  <SelectItem value="maintenance">Manutenção (Vermelho)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Mensagem</Label>
            <Textarea value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} placeholder="Descreva o aviso em detalhes..." />
          </div>
          <div className="grid gap-4 md:grid-cols-2 items-end">
            <div className="space-y-2">
              <Label>Data de Expiração (Opcional)</Label>
              <Input type="datetime-local" value={form.expires_at} onChange={(e) => setForm({ ...form, expires_at: e.target.value })} />
            </div>
            <Button onClick={save} disabled={saving} className="w-full md:w-auto">
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Criar Aviso
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Megaphone className="w-4 h-4 text-primary" /> Gerenciar Avisos
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Título</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Criado em</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(announcements.data ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground italic">Nenhum aviso cadastrado.</TableCell>
                </TableRow>
              )}
              {(announcements.data ?? []).map((a: any) => (
                <TableRow key={a.id}>
                  <TableCell className="font-medium">{a.title}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={cn(
                      a.type === 'maintenance' && "border-destructive text-destructive bg-destructive/5",
                      a.type === 'warning' && "border-orange-500 text-orange-500 bg-orange-500/5",
                      a.type === 'update' && "border-green-500 text-green-500 bg-green-500/5",
                      a.type === 'info' && "border-blue-500 text-blue-500 bg-blue-500/5",
                    )}>
                      {a.type.toUpperCase()}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={a.is_active ? "default" : "secondary"}>
                      {a.is_active ? "Ativo" : "Inativo"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{format(new Date(a.created_at), "dd/MM/yy HH:mm")}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => toggle(a.id, !a.is_active)}>
                        {a.is_active ? <Zap className="w-4 h-4 text-muted-foreground" /> : <Zap className="w-4 h-4 text-primary" />}
                      </Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => remove(a.id)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function cn(...inputs: any[]) {
  return inputs.filter(Boolean).join(" ");
}

function TelaoSettingsTab() {
  const [threshold, setThreshold] = useLoopDuplicateThreshold();
  const [draft, setDraft] = useState<string>(String(threshold));

  const save = () => {
    const n = Number(draft);
    if (!Number.isFinite(n) || n < TELAO_THRESHOLD_MIN || n > TELAO_THRESHOLD_MAX) {
      toast.error(`Informe um número entre ${TELAO_THRESHOLD_MIN} e ${TELAO_THRESHOLD_MAX}`);
      return;
    }
    setThreshold(n);
    toast.success("Configuração do telão salva");
  };

  return (
    <Card className="border-border/50">
      <CardHeader>
        <CardTitle className="text-base">Loop de vendas do telão</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <p className="text-muted-foreground">
          Define o limite mínimo de vendas exibidas antes do telão começar a duplicar visualmente
          os itens (para preencher o efeito de loop). Abaixo desse número, as vendas são repetidas
          na tela; acima, cada venda aparece uma única vez.
        </p>
        <div className="grid gap-3 md:grid-cols-[200px_auto] items-end">
          <div className="space-y-1">
            <Label>Limite para duplicar (itens)</Label>
            <Input
              type="number"
              min={TELAO_THRESHOLD_MIN}
              max={TELAO_THRESHOLD_MAX}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <Button onClick={save}>Salvar</Button>
            <Button
              variant="outline"
              onClick={() => {
                setDraft(String(TELAO_THRESHOLD_DEFAULT));
                setThreshold(TELAO_THRESHOLD_DEFAULT);
                toast.success("Restaurado para o padrão");
              }}
            >
              Padrão ({TELAO_THRESHOLD_DEFAULT})
            </Button>
          </div>
        </div>
        <div className="text-xs text-muted-foreground">
          Valor atual aplicado: <strong>{threshold}</strong>. A configuração é salva neste navegador
          e aplicada imediatamente ao abrir o telão.
        </div>
      </CardContent>
    </Card>
  );
}

function CelebrationSettingsCard() {
  return <CelebrationSettingsCardInner />;
}

function TelaoOverlayDurationCard() {
  const [seconds, setSeconds] = useBigSellerOverlaySeconds();
  const [draft, setDraft] = useState<string>(String(seconds));

  useEffect(() => {
    setDraft(String(seconds));
  }, [seconds]);

  const save = () => {
    const n = Number(draft);
    if (!Number.isFinite(n) || n < TELAO_OVERLAY_MIN || n > TELAO_OVERLAY_MAX) {
      toast.error(`Informe um número entre ${TELAO_OVERLAY_MIN} e ${TELAO_OVERLAY_MAX} segundos`);
      return;
    }
    setSeconds(n);
    toast.success("Tempo de exibição do overlay salvo");
  };

  return (
    <Card className="border-border/50">
      <CardHeader>
        <CardTitle className="text-base">Tempo de exibição do overlay</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <p className="text-muted-foreground">
          Define por quantos segundos o overlay de destaque (nome do vendedor, valor da venda
          e "+ Mais uma venda!") fica visível no centro do telão após uma nova venda.
        </p>
        <div className="grid gap-3 md:grid-cols-[200px_auto] items-end">
          <div className="space-y-1">
            <Label>Duração (segundos)</Label>
            <Input
              type="number"
              min={TELAO_OVERLAY_MIN}
              max={TELAO_OVERLAY_MAX}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <Button onClick={save}>Salvar</Button>
            <Button
              variant="outline"
              onClick={() => {
                setDraft(String(TELAO_OVERLAY_DEFAULT));
                setSeconds(TELAO_OVERLAY_DEFAULT);
                toast.success("Restaurado para o padrão");
              }}
            >
              Padrão ({TELAO_OVERLAY_DEFAULT}s)
            </Button>
          </div>
        </div>
        <div className="text-xs text-muted-foreground">
          Valor atual aplicado: <strong>{seconds} segundos</strong>. A configuração é salva
          neste navegador e aplicada imediatamente ao abrir o telão.
        </div>
      </CardContent>
    </Card>
  );
}

function CelebrationSettingsCardInner() {
  const [settings, update] = useCelebrationSettings();

  const preview = () => {
    try {
      const AC = (window.AudioContext || (window as any).webkitAudioContext);
      const ctx = new AC();
      const master = ctx.createGain();
      master.gain.value = (settings.volume / 100) * 0.5;
      master.connect(ctx.destination);
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = 880;
      o.connect(master);
      o.start();
      o.stop(ctx.currentTime + 0.25);
      setTimeout(() => ctx.close(), 400);
    } catch {}
  };

  return (
    <Card className="border-border/50">
      <CardHeader>
        <CardTitle className="text-base">Efeitos de celebração</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5 text-sm">
        <p className="text-muted-foreground">
          Controle os efeitos disparados no telão quando uma nova venda é registrada.
        </p>

        <div className="flex items-center justify-between gap-4 p-3 rounded-md border border-border/50">
          <div>
            <Label className="text-sm">Som de celebração</Label>
            <p className="text-xs text-muted-foreground">Toca o efeito sonoro escolhido no telão.</p>
          </div>
          <Switch
            checked={settings.soundEnabled}
            onCheckedChange={(v) => { update({ soundEnabled: v }); toast.success(v ? "Som ativado" : "Som desativado"); }}
          />
        </div>

        <div className="flex items-center justify-between gap-4 p-3 rounded-md border border-border/50">
          <div>
            <Label className="text-sm">Confete</Label>
            <p className="text-xs text-muted-foreground">Anima confetes dourados na tela a cada nova venda.</p>
          </div>
          <Switch
            checked={settings.confettiEnabled}
            onCheckedChange={(v) => { update({ confettiEnabled: v }); toast.success(v ? "Confete ativado" : "Confete desativado"); }}
          />
        </div>

        <div className="space-y-2 p-3 rounded-md border border-border/50">
          <div className="flex items-center justify-between">
            <Label className="text-sm">Volume dos efeitos</Label>
            <span className="text-xs text-muted-foreground tabular-nums">{settings.volume}%</span>
          </div>
          <Slider
            value={[settings.volume]}
            min={0}
            max={100}
            step={1}
            onValueChange={(v) => update({ volume: v[0] ?? 0 })}
            disabled={!settings.soundEnabled}
          />
          <div className="flex justify-end">
            <Button size="sm" variant="outline" onClick={preview} disabled={!settings.soundEnabled}>
              Testar volume
            </Button>
          </div>
        </div>

        <div className="text-xs text-muted-foreground">
          As preferências são salvas neste navegador e aplicadas imediatamente no telão.
        </div>
      </CardContent>
    </Card>
  );
}