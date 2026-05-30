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

export const Route = createFileRoute("/_authenticated/admin")({
  component: AdminPage,
});

function AdminPage() {
  const qc = useQueryClient();
  const goals = useQuery({ queryKey: ["admin-goals"], queryFn: async () => (await supabase.from("goals").select("*").is("seller_id", null)).data ?? [] });
  const services = useQuery({ queryKey: ["admin-services"], queryFn: async () => (await supabase.from("service_types").select("*").order("sort_order")).data ?? [] });
  const cols = useQuery({ queryKey: ["admin-cols"], queryFn: async () => (await supabase.from("kanban_columns").select("*").order("sort_order")).data ?? [] });
  const [newService, setNewService] = useState("");
  const [newCol, setNewCol] = useState("");

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

  return (
    <div className="space-y-6">
      <div><h1 className="text-3xl font-bold tracking-tight">Configurações</h1><p className="text-muted-foreground">Painel administrativo</p></div>
      <Tabs defaultValue="goals">
        <TabsList>
          <TabsTrigger value="goals">Metas</TabsTrigger>
          <TabsTrigger value="services">Tipos de Serviço</TabsTrigger>
          <TabsTrigger value="kanban">Colunas Kanban</TabsTrigger>
          <TabsTrigger value="pagarme">Pagar.me</TabsTrigger>
          <TabsTrigger value="nfe">Nota Fiscal</TabsTrigger>
        </TabsList>

        <TabsContent value="goals" className="space-y-3 mt-4">
          {(goals.data ?? []).map((g: any) => (
            <Card key={g.id} className="border-border/50"><CardContent className="p-4 flex items-center gap-3">
              <div className="w-32 font-medium capitalize">{g.period}</div>
              <Input type="number" defaultValue={g.target_amount} onBlur={(e) => updateGoal(g.id, e.target.value)} className="max-w-xs" />
              <span className="text-xs text-muted-foreground">Salva automaticamente ao sair do campo</span>
            </CardContent></Card>
          ))}
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