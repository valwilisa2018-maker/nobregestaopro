import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageShell } from "@/components/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { LifeBuoy, Loader2, Send, CheckCircle2, Phone, Mail, MessageCircle, Save } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/master/support")({
  head: () => ({ meta: [{ title: "Suporte — Admin Master" }] }),
  component: Page,
});

type Ticket = { id: string; user_id: string; subject: string; status: string; priority: string; last_message_at: string; created_at: string };
type Msg = { id: string; ticket_id: string; sender_id: string; sender_role: string; body: string; created_at: string };
type SupportContacts = { phone?: string; email?: string; whatsapp?: string; whatsapp_message?: string };

function Page() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [contacts, setContacts] = useState<SupportContacts>({});
  const [savingContacts, setSavingContacts] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("support_tickets").select("*").order("last_message_at", { ascending: false }).limit(200);
    setTickets((data as Ticket[]) ?? []);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    supabase.from("internal_config").select("value").eq("key", "support_contacts").maybeSingle()
      .then(({ data }) => {
        if (!data?.value) return;
        try { setContacts(JSON.parse(data.value) as SupportContacts); } catch { /* ignore */ }
      });
  }, []);

  const saveContacts = async () => {
    setSavingContacts(true);
    const value = JSON.stringify(contacts);
    const { data: existing } = await supabase.from("internal_config").select("key").eq("key", "support_contacts").maybeSingle();
    const { error } = existing
      ? await supabase.from("internal_config").update({ value }).eq("key", "support_contacts")
      : await supabase.from("internal_config").insert({ key: "support_contacts", value });
    setSavingContacts(false);
    if (error) toast.error(error.message); else toast.success("Contatos de suporte salvos");
  };

  useEffect(() => {
    if (!selected) return;
    (async () => {
      const { data } = await supabase.from("support_messages").select("*").eq("ticket_id", selected.id).order("created_at");
      setMessages((data as Msg[]) ?? []);
    })();
  }, [selected]);

  const send = async () => {
    if (!reply.trim() || !selected) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setSending(true);
    const { error } = await supabase.from("support_messages").insert({
      ticket_id: selected.id, sender_id: user.id, sender_role: "master", body: reply,
    });
    if (!error) {
      await supabase.from("support_tickets").update({ status: "pending", last_message_at: new Date().toISOString() }).eq("id", selected.id);
      setReply("");
      const { data } = await supabase.from("support_messages").select("*").eq("ticket_id", selected.id).order("created_at");
      setMessages((data as Msg[]) ?? []);
      load();
    } else toast.error(error.message);
    setSending(false);
  };

  const close = async () => {
    if (!selected) return;
    await supabase.from("support_tickets").update({ status: "closed" }).eq("id", selected.id);
    toast.success("Ticket encerrado");
    load();
  };

  return (
    <PageShell title="Suporte" description="Atenda as solicitações dos clientes." icon={<LifeBuoy className="h-6 w-6" />} status="ativo">
      <Card className="mb-4 border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
        <CardContent className="p-5 space-y-4">
          <div>
            <h3 className="font-semibold flex items-center gap-2"><MessageCircle className="h-4 w-4 text-primary" /> Canais de contato exibidos ao cliente</h3>
            <p className="text-xs text-muted-foreground mt-1">Estes dados aparecem no topo da página de Suporte de cada cliente.</p>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-1.5">
              <Label className="flex items-center gap-2 text-xs"><MessageCircle className="h-3.5 w-3.5 text-emerald-500" /> WhatsApp (com DDI)</Label>
              <Input placeholder="+5511999999999" value={contacts.whatsapp ?? ""} onChange={e => setContacts(c => ({ ...c, whatsapp: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label className="flex items-center gap-2 text-xs"><Phone className="h-3.5 w-3.5 text-primary" /> Telefone</Label>
              <Input placeholder="(11) 9999-9999" value={contacts.phone ?? ""} onChange={e => setContacts(c => ({ ...c, phone: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label className="flex items-center gap-2 text-xs"><Mail className="h-3.5 w-3.5 text-blue-500" /> E-mail</Label>
              <Input type="email" placeholder="suporte@empresa.com" value={contacts.email ?? ""} onChange={e => setContacts(c => ({ ...c, email: e.target.value }))} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Mensagem inicial do WhatsApp (opcional)</Label>
            <Input placeholder="Olá, preciso de ajuda com..." value={contacts.whatsapp_message ?? ""} onChange={e => setContacts(c => ({ ...c, whatsapp_message: e.target.value }))} />
          </div>
          <div className="flex justify-end">
            <Button onClick={saveContacts} disabled={savingContacts} className="gap-2">
              {savingContacts ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar contatos
            </Button>
          </div>
        </CardContent>
      </Card>
      {loading ? (
        <div className="p-12 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
          <Card><CardContent className="p-0 max-h-[70vh] overflow-y-auto">
            {tickets.map(t => (
              <button key={t.id} onClick={() => setSelected(t)}
                className={`w-full text-left p-3 border-b hover:bg-muted/40 ${selected?.id === t.id ? "bg-muted/40" : ""}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-sm truncate">{t.subject}</span>
                  <Badge variant={t.status === "open" ? "default" : t.status === "closed" ? "secondary" : "outline"}>{t.status}</Badge>
                </div>
                <div className="text-xs text-muted-foreground mt-1">{new Date(t.last_message_at).toLocaleString("pt-BR")}</div>
              </button>
            ))}
            {tickets.length === 0 && <div className="p-8 text-center text-muted-foreground text-sm">Nenhum ticket.</div>}
          </CardContent></Card>

          <Card>
            <CardContent className="p-4 flex flex-col h-[70vh]">
              {!selected ? (
                <div className="flex-1 grid place-items-center text-muted-foreground">Selecione um ticket</div>
              ) : (
                <>
                  <div className="flex items-center justify-between border-b pb-3">
                    <div>
                      <h3 className="font-semibold">{selected.subject}</h3>
                      <p className="text-xs text-muted-foreground">Cliente {selected.user_id.slice(0, 8)} · {selected.status}</p>
                    </div>
                    <Button size="sm" variant="outline" onClick={close}><CheckCircle2 className="h-4 w-4" /> Encerrar</Button>
                  </div>
                  <div className="flex-1 overflow-y-auto py-3 space-y-2">
                    {messages.map(m => (
                      <div key={m.id} className={`flex ${m.sender_role === "master" ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${m.sender_role === "master" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                          <p className="whitespace-pre-wrap">{m.body}</p>
                          <p className="text-[10px] opacity-70 mt-1">{new Date(m.created_at).toLocaleString("pt-BR")}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2 border-t pt-3">
                    <Textarea rows={2} value={reply} onChange={e => setReply(e.target.value)} placeholder="Escreva uma resposta..." />
                    <Button onClick={send} disabled={sending || !reply.trim()}>
                      {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </PageShell>
  );
}