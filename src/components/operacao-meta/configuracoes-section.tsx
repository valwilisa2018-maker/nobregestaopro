import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, Copy, Link as LinkIcon, Webhook } from "lucide-react";
import {
  omSaveScoring,
  omUpsertListMap,
  omDeleteListMap,
  omUpsertMemberMap,
  omDeleteMemberMap,
  omSaveWebhookSecret,
} from "@/lib/om-config.functions";

const EVENTOS = [
  { value: "pronto", label: "Serviço Pronto" },
  { value: "alteracao", label: "Alteração" },
  { value: "entregue", label: "Entregue" },
  { value: "distribuicao_edicao", label: "Distribuição p/ Edição (gravação)" },
] as const;

// Apenas estes eventos geram pontuação. Os demais (Alteração, Entregue)
// são apenas registrados para contagem.
const SCORING_EVENTOS = EVENTOS.filter(
  (e) => e.value === "pronto" || e.value === "distribuicao_edicao",
);

export function OmConfiguracoesSection() {
  const qc = useQueryClient();
  const scoring = useQuery({
    queryKey: ["om-scoring"],
    queryFn: async () => (await (supabase as any).from("om_scoring").select("*")).data ?? [],
  });
  const lists = useQuery({
    queryKey: ["om-trello-lists"],
    queryFn: async () => (await (supabase as any).from("om_trello_list_map").select("*").order("list_name")).data ?? [],
  });
  const members = useQuery({
    queryKey: ["om-trello-members"],
    queryFn: async () => (await (supabase as any).from("om_trello_member_map").select("*, producers(name)").order("trello_username")).data ?? [],
  });
  const producers = useQuery({
    queryKey: ["om-producers-cfg"],
    queryFn: async () => (await supabase.from("producers").select("id,name").eq("active", true).order("name")).data ?? [],
  });
  const settings = useQuery({
    queryKey: ["om-settings-cfg"],
    queryFn: async () => (await (supabase as any).from("om_settings").select("trello_webhook_secret").eq("id", true).maybeSingle()).data,
  });

  const saveScoring = useServerFn(omSaveScoring);
  const upsertList = useServerFn(omUpsertListMap);
  const delList = useServerFn(omDeleteListMap);
  const upsertMember = useServerFn(omUpsertMemberMap);
  const delMember = useServerFn(omDeleteMemberMap);
  const saveSecret = useServerFn(omSaveWebhookSecret);

  const webhookURL = typeof window !== "undefined" ? `${window.location.origin}/api/public/trello-webhook` : "";

  return (
    <div className="space-y-4">
      <Card className="border-border/50">
        <CardContent className="p-5 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Webhook className="w-4 h-4 text-primary" /> Webhook do Trello
          </div>
          <p className="text-xs text-muted-foreground">
            Configure no Trello (API) apontando para a URL abaixo. Todo movimento de card será pontuado automaticamente conforme os mapeamentos.
          </p>
          <div className="flex gap-2">
            <Input readOnly value={webhookURL} className="font-mono text-xs" />
            <Button variant="outline" size="icon" onClick={() => { navigator.clipboard.writeText(webhookURL); toast.success("URL copiada"); }}>
              <Copy className="w-4 h-4" />
            </Button>
          </div>
          <SecretEditor current={(settings.data as any)?.trello_webhook_secret ?? ""} onSave={async (s) => {
            await saveSecret({ data: { secret: s } });
            toast.success("Segredo salvo");
            qc.invalidateQueries({ queryKey: ["om-settings-cfg"] });
          }} />
        </CardContent>
      </Card>

      <Card className="border-border/50">
        <CardContent className="p-5 space-y-3">
          <div className="text-sm font-semibold">Multiplicador por Evento</div>
          <p className="text-xs text-muted-foreground">
            Apenas <b>Serviço Pronto</b> e <b>Distribuição p/ Edição (gravação)</b> geram pontuação.
            <br />Alteração e Entregue são registrados apenas para contagem (0 pontos).
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {SCORING_EVENTOS.map((e) => {
              const row = (scoring.data as any[])?.find((r) => r.evento === e.value);
              return (
                <ScoringRow
                  key={e.value}
                  label={e.label}
                  value={Number(row?.multiplicador ?? 1)}
                  onSave={async (v) => {
                    await saveScoring({ data: { evento: e.value, multiplicador: v } });
                    toast.success("Salvo");
                    qc.invalidateQueries({ queryKey: ["om-scoring"] });
                  }}
                />
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/50">
        <CardContent className="p-5 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <LinkIcon className="w-4 h-4" /> Listas do Trello → Evento
          </div>
          <p className="text-xs text-muted-foreground">
            Cole o <b>ID da lista</b> (encontrado no Trello via API ou URL JSON do board) e escolha o evento que ela representa.
          </p>
          <ListMapForm onSubmit={async (v) => {
            await upsertList({ data: v });
            toast.success("Lista mapeada");
            qc.invalidateQueries({ queryKey: ["om-trello-lists"] });
          }} />
          <div className="space-y-2">
            {(lists.data as any[])?.map((l) => (
              <div key={l.id} className="flex items-center gap-2 p-2 rounded-lg border border-border/40 bg-muted/20">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{l.list_name}</div>
                  <div className="text-[10px] text-muted-foreground font-mono truncate">{l.list_id}</div>
                </div>
                <div className="text-xs px-2 py-1 rounded bg-primary/10 text-primary">{EVENTOS.find((e) => e.value === l.evento)?.label ?? l.evento}</div>
                <Button size="icon" variant="ghost" onClick={async () => {
                  await delList({ data: { id: l.id } });
                  qc.invalidateQueries({ queryKey: ["om-trello-lists"] });
                }}><Trash2 className="w-4 h-4" /></Button>
              </div>
            ))}
            {(!lists.data || (lists.data as any[]).length === 0) && (
              <div className="text-xs text-muted-foreground italic">Nenhuma lista mapeada ainda.</div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/50">
        <CardContent className="p-5 space-y-3">
          <div className="text-sm font-semibold">Membros do Trello → Produtor</div>
          <p className="text-xs text-muted-foreground">
            Quem moveu o card no Trello vira o produtor que recebe os pontos.
          </p>
          <MemberMapForm producers={(producers.data as any[]) ?? []} onSubmit={async (v) => {
            await upsertMember({ data: v });
            toast.success("Membro mapeado");
            qc.invalidateQueries({ queryKey: ["om-trello-members"] });
          }} />
          <div className="space-y-2">
            {(members.data as any[])?.map((m) => (
              <div key={m.id} className="flex items-center gap-2 p-2 rounded-lg border border-border/40 bg-muted/20">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{m.trello_username ?? "(sem username)"} → {m.producers?.name}</div>
                  <div className="text-[10px] text-muted-foreground font-mono truncate">{m.trello_member_id}</div>
                </div>
                <Button size="icon" variant="ghost" onClick={async () => {
                  await delMember({ data: { id: m.id } });
                  qc.invalidateQueries({ queryKey: ["om-trello-members"] });
                }}><Trash2 className="w-4 h-4" /></Button>
              </div>
            ))}
            {(!members.data || (members.data as any[]).length === 0) && (
              <div className="text-xs text-muted-foreground italic">Nenhum membro mapeado ainda.</div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ScoringRow({ label, value, onSave }: { label: string; value: number; onSave: (v: number) => Promise<void> }) {
  const [v, setV] = useState(String(value));
  return (
    <div className="flex items-center gap-2 p-3 rounded-lg border border-border/40 bg-muted/20">
      <div className="flex-1">
        <Label className="text-xs">{label}</Label>
        <Input type="number" step="0.1" min="0" value={v} onChange={(e) => setV(e.target.value)} className="mt-1 h-9" />
      </div>
      <Button size="sm" onClick={() => onSave(Number(v) || 0)} className="self-end">Salvar</Button>
    </div>
  );
}

function ListMapForm({ onSubmit }: { onSubmit: (v: { list_id: string; list_name: string; evento: string }) => Promise<void> }) {
  const [listId, setListId] = useState("");
  const [listName, setListName] = useState("");
  const [evento, setEvento] = useState<string>("pronto");
  return (
    <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_1fr_auto] gap-2">
      <Input placeholder="ID da lista (Trello)" value={listId} onChange={(e) => setListId(e.target.value)} />
      <Input placeholder="Nome (rótulo)" value={listName} onChange={(e) => setListName(e.target.value)} />
      <Select value={evento} onValueChange={setEvento}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          {EVENTOS.map((e) => <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>)}
        </SelectContent>
      </Select>
      <Button onClick={async () => {
        if (!listId || !listName) return;
        await onSubmit({ list_id: listId, list_name: listName, evento });
        setListId(""); setListName("");
      }}>Adicionar</Button>
    </div>
  );
}

function MemberMapForm({ producers, onSubmit }: { producers: any[]; onSubmit: (v: { trello_member_id: string; trello_username?: string; producer_id: string }) => Promise<void> }) {
  const [memberId, setMemberId] = useState("");
  const [username, setUsername] = useState("");
  const [producerId, setProducerId] = useState<string>("");
  return (
    <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_1fr_auto] gap-2">
      <Input placeholder="ID do membro (Trello)" value={memberId} onChange={(e) => setMemberId(e.target.value)} />
      <Input placeholder="Username (opcional)" value={username} onChange={(e) => setUsername(e.target.value)} />
      <Select value={producerId} onValueChange={setProducerId}>
        <SelectTrigger><SelectValue placeholder="Produtor" /></SelectTrigger>
        <SelectContent>
          {producers.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
        </SelectContent>
      </Select>
      <Button onClick={async () => {
        if (!memberId || !producerId) return;
        await onSubmit({ trello_member_id: memberId, trello_username: username || undefined, producer_id: producerId });
        setMemberId(""); setUsername(""); setProducerId("");
      }}>Adicionar</Button>
    </div>
  );
}

function SecretEditor({ current, onSave }: { current: string; onSave: (s: string) => Promise<void> }) {
  const [v, setV] = useState(current);
  return (
    <div className="flex gap-2 items-end">
      <div className="flex-1">
        <Label className="text-xs">Segredo do webhook (opcional — para validar assinatura HMAC)</Label>
        <Input type="password" value={v} onChange={(e) => setV(e.target.value)} className="mt-1 font-mono" />
      </div>
      <Button onClick={() => onSave(v)}>Salvar</Button>
    </div>
  );
}