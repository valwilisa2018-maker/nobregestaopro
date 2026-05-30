import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { CheckCircle2, AlertCircle } from "lucide-react";
import {
  useLoopDuplicateThreshold,
  TELAO_THRESHOLD_DEFAULT,
  TELAO_THRESHOLD_MIN,
  TELAO_THRESHOLD_MAX,
} from "@/hooks/use-telao-settings";

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
  const qc = useQueryClient();
  const goals = useQuery({ queryKey: ["admin-goals"], queryFn: async () => (await supabase.from("goals").select("*").is("seller_id", null)).data ?? [] });
  const services = useQuery({ queryKey: ["admin-services"], queryFn: async () => (await supabase.from("service_types").select("*").order("sort_order")).data ?? [] });
  const cols = useQuery({ queryKey: ["admin-cols"], queryFn: async () => (await supabase.from("kanban_columns").select("*").order("sort_order")).data ?? [] });
  const sellers = useQuery({ queryKey: ["admin-sellers"], queryFn: async () => (await supabase.from("sellers").select("*").order("name")).data ?? [] });
  const [newService, setNewService] = useState("");
  const [newCol, setNewCol] = useState("");
  const [newSeller, setNewSeller] = useState({ name: "", email: "", phone: "", commission_rate: "", monthly_goal: "" });

  const updateGoal = async (id: string, amount: string) => {
    const { error } = await supabase.from("goals").update({ target_amount: Number(amount) }).eq("id", id);
    if (error) toast.error(error.message); else { toast.success("Meta atualizada"); qc.invalidateQueries(); }
  };
  const addService = async () => {
    if (!newService) return;
    const { error } = await supabase.from("service_types").insert({ name: newService, sort_order: 999 });
    if (error) toast.error(error.message); else { toast.success("Tipo de serviço criado"); setNewService(""); qc.invalidateQueries(); }
  };
  const addCol = async () => {
    if (!newCol) return;
    const max = Math.max(...(cols.data ?? []).map((c: any) => c.sort_order ?? 0), 0);
    const { error } = await supabase.from("kanban_columns").insert({ name: newCol, sort_order: max + 10 });
    if (error) toast.error(error.message); else { toast.success("Coluna criada"); setNewCol(""); qc.invalidateQueries(); }
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

  return (
    <div className="space-y-6">
      <div><h1 className="text-3xl font-bold tracking-tight">Configurações</h1><p className="text-muted-foreground">Painel administrativo</p></div>
      <Tabs defaultValue="goals">
        <TabsList>
          <TabsTrigger value="goals">Metas</TabsTrigger>
          <TabsTrigger value="commissions">Comissões</TabsTrigger>
          <TabsTrigger value="services">Tipos de Serviço</TabsTrigger>
          <TabsTrigger value="kanban">Colunas Kanban</TabsTrigger>
          <TabsTrigger value="pagarme">Pagar.me</TabsTrigger>
          <TabsTrigger value="nfe">Nota Fiscal</TabsTrigger>
          <TabsTrigger value="telao">Telão</TabsTrigger>
        </TabsList>

        <TabsContent value="goals" className="space-y-3 mt-4">
          {(goals.data ?? []).map((g: any) => (
            <Card key={g.id} className="border-border/50"><CardContent className="p-4 flex items-center gap-3">
              <div className="w-32 font-medium">{PERIOD_LABEL[g.period] ?? g.period}</div>
              <Input type="number" defaultValue={g.target_amount} onBlur={(e) => updateGoal(g.id, e.target.value)} className="max-w-xs" />
              <span className="text-xs text-muted-foreground">Salva automaticamente ao sair do campo</span>
            </CardContent></Card>
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
                  <Button variant={s.active ? "outline" : "default"} size="sm" onClick={() => toggleSellerActive(s.id, !s.active)}>
                    {s.active ? "Desativar" : "Ativar"}
                  </Button>
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
              <div key={s.id} className="p-3 rounded-lg border border-border/50 bg-card flex items-center justify-between">
                <span>{s.name}</span>
                <span className="text-xs text-muted-foreground">{s.active ? "Ativo" : "Inativo"}</span>
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
                <span className="w-3 h-3 rounded-full" style={{ background: c.color }} />
                <span className="flex-1">{c.name}</span>
                <span className="text-xs text-muted-foreground">Ordem {c.sort_order}</span>
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="pagarme" className="mt-4 space-y-3">
          <Card className="border-border/50">
            <CardHeader>
              <CardTitle className="text-base">Integração Pagar.me</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <p className="text-muted-foreground">
                Para gerar links de pagamento, cadastre a chave secreta da sua conta Pagar.me (API v5).
                A chave fica armazenada de forma segura no servidor — nunca aparece no navegador.
              </p>
              <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                <li>Acesse o painel da Pagar.me → Configurações → Chaves de API.</li>
                <li>Copie a <strong>Secret Key</strong> (começa com <code>sk_</code>).</li>
                <li>Cole no campo de credenciais do servidor (variável <code>PAGARME_API_KEY</code>).</li>
              </ol>
              <div className="p-3 rounded-lg border border-border/50 bg-muted/30 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 mt-0.5 text-amber-500 shrink-0" />
                <div>
                  <div className="font-medium">Chave da API</div>
                  <div className="text-muted-foreground text-xs mt-1">
                    Peça ao administrador para configurar o segredo <code>PAGARME_API_KEY</code>. Após salvo,
                    o menu <strong>Gerar Pagamento</strong> passa a funcionar imediatamente.
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                Métodos suportados: Cartão de Crédito (até 12x), Pix e Boleto.
              </div>
            </CardContent>
          </Card>
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
      </Tabs>
    </div>
  );
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