import { createFileRoute } from "@tanstack/react-router";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { CheckCircle2, AlertCircle, AlertTriangle, Loader2 } from "lucide-react";
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
  const [newPkg, setNewPkg] = useState({ name: "", quantity: "1", default_price: "" });
  const addPackage = async () => {
    if (!newPkg.name.trim()) { toast.error("Informe o nome do pacote"); return; }
    const { error } = await supabase.from("packages").insert({
      name: newPkg.name.trim(),
      quantity: Number(newPkg.quantity || 1),
      default_price: Number(newPkg.default_price || 0),
      active: true,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Pacote cadastrado");
    setNewPkg({ name: "", quantity: "1", default_price: "" });
    qc.invalidateQueries({ queryKey: ["admin-packages"] });
    qc.invalidateQueries({ queryKey: ["pkg-all"] });
  };
  const togglePackage = async (id: string, active: boolean) => {
    const { error } = await supabase.from("packages").update({ active: !active }).eq("id", id);
    if (error) toast.error(error.message);
    else { qc.invalidateQueries({ queryKey: ["admin-packages"] }); qc.invalidateQueries({ queryKey: ["pkg-all"] }); }
  };

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
        <TabsList>
          <TabsTrigger value="goals">Metas</TabsTrigger>
          <TabsTrigger value="commissions">Comissões</TabsTrigger>
          <TabsTrigger value="services">Tipos de Serviço</TabsTrigger>
          <TabsTrigger value="kanban">Colunas Kanban</TabsTrigger>
          <TabsTrigger value="packages">Pacotes</TabsTrigger>
          <TabsTrigger value="pagarme">Pagar.me</TabsTrigger>
          <TabsTrigger value="nfe">Nota Fiscal</TabsTrigger>
          <TabsTrigger value="telao">Telão</TabsTrigger>
          <TabsTrigger value="senha">Senha</TabsTrigger>
          <TabsTrigger value="reset" className="text-destructive">Resetar</TabsTrigger>
          <TabsTrigger value="audit">Auditoria</TabsTrigger>
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
            <CardContent className="grid gap-2 md:grid-cols-4">
              <Input className="md:col-span-2" placeholder="Nome do pacote" value={newPkg.name} onChange={(e) => setNewPkg({ ...newPkg, name: e.target.value })} />
              <Input type="number" min="1" placeholder="Qtd. serviços" value={newPkg.quantity} onChange={(e) => setNewPkg({ ...newPkg, quantity: e.target.value })} />
              <Input type="number" step="0.01" placeholder="Preço sugerido (R$)" value={newPkg.default_price} onChange={(e) => setNewPkg({ ...newPkg, default_price: e.target.value })} />
              <Button className="md:col-span-4" onClick={addPackage}>Adicionar pacote</Button>
            </CardContent>
          </Card>
          <div className="grid gap-2">
            {(packages.data ?? []).map((p: any) => (
              <div key={p.id} className="p-3 rounded-lg border border-border/50 bg-card flex items-center gap-3">
                <span className="flex-1 font-medium">{p.name}</span>
                <span className="text-xs text-muted-foreground">{p.quantity} serviço(s)</span>
                <span className="text-xs text-muted-foreground">R$ {Number(p.default_price ?? 0).toFixed(2)}</span>
                <Button size="sm" variant={p.active ? "outline" : "secondary"} onClick={() => togglePackage(p.id, p.active)}>
                  {p.active ? "Desativar" : "Ativar"}
                </Button>
              </div>
            ))}
            {(packages.data ?? []).length === 0 && (
              <div className="text-sm text-muted-foreground p-4 text-center">Nenhum pacote cadastrado.</div>
            )}
          </div>
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
      // Ordem importa por causa das dependências (invoices/service_orders referenciam sales)
      const tables = [
        "invoices",
        "service_orders",
        "cash_movements",
        "expenses",
        "sales",
        "packages",
        "customers",
      ] as const;
      const counts: Record<string, number> = {};
      for (const t of tables) {
        const { count: before } = await supabase
          .from(t)
          .select("id", { count: "exact", head: true });
        const { error } = await supabase
          .from(t)
          .delete()
          .not("id", "is", null);
        if (error) throw new Error(`${t}: ${error.message}`);
        counts[t] = before ?? 0;
      }

      const totalDeleted = Object.values(counts).reduce((a, b) => a + b, 0);
      const { data: userRes } = await supabase.auth.getUser();
      const user = userRes.user;
      if (user) {
        await supabase.from("audit_logs").insert({
          action: "platform_reset",
          performed_by: user.id,
          performed_by_email: user.email ?? null,
          details: { tables: counts, total_deleted: totalDeleted },
        });
      }

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