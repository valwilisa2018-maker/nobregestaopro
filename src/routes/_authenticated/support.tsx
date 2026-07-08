import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageShell } from "@/components/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { LifeBuoy, Loader2, Send, Plus } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/support")({
  head: () => ({ meta: [{ title: "Suporte — Plataforma" }] }),
  component: Page,
});

type Ticket = { id: string; subject: string; status: string; last_message_at: string; created_at: string };
type Msg = { id: string; sender_role: string; body: string; created_at: string };

function Page() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [reply, setReply] = useState("");
  const [newOpen, setNewOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [firstMsg, setFirstMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("support_tickets").select("*").order("last_message_at", { ascending: false });
    setTickets((data as Ticket[]) ?? []);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!selected) return;
    supabase.from("support_messages").select("id,sender_role,body,created_at")
      .eq("ticket_id", selected.id).order("created_at").then(({ data }) => setMessages((data as Msg[]) ?? []));
  }, [selected]);

  const openNew = async () => {
    if (!subject.trim() || !firstMsg.trim()) return toast.error("Preencha assunto e mensagem");
    setBusy(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setBusy(false); return; }
    const { data, error } = await supabase.from("support_tickets").insert({
      user_id: user.id, subject, status: "open",
    }).select().single();
    if (error) { setBusy(false); return toast.error(error.message); }
    await supabase.from("support_messages").insert({
      ticket_id: data.id, sender_id: user.id, sender_role: "user", body: firstMsg,
    });
    setBusy(false); setNewOpen(false); setSubject(""); setFirstMsg("");
    toast.success("Ticket aberto");
    load();
  };

  const send = async () => {
    if (!reply.trim() || !selected) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase.from("support_messages").insert({
      ticket_id: selected.id, sender_id: user.id, sender_role: "user", body: reply,
    });
    if (error) return toast.error(error.message);
    await supabase.from("support_tickets").update({ status: "open", last_message_at: new Date().toISOString() }).eq("id", selected.id);
    setReply("");
    const { data } = await supabase.from("support_messages").select("id,sender_role,body,created_at")
      .eq("ticket_id", selected.id).order("created_at");
    setMessages((data as Msg[]) ?? []);
  };

  return (
    <PageShell title="Suporte" description="Abra um ticket e nossa equipe responde por aqui." icon={<LifeBuoy className="h-6 w-6" />} status="ativo"
      actions={<Button onClick={() => setNewOpen(true)}><Plus className="h-4 w-4" /> Novo ticket</Button>}>
      {loading ? <div className="p-12 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div> : (
        <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
          <Card><CardContent className="p-0 max-h-[70vh] overflow-y-auto">
            {tickets.map(t => (
              <button key={t.id} onClick={() => setSelected(t)}
                className={`w-full text-left p-3 border-b hover:bg-muted/40 ${selected?.id === t.id ? "bg-muted/40" : ""}`}>
                <div className="flex items-center justify-between">
                  <span className="font-medium text-sm truncate">{t.subject}</span>
                  <Badge variant="outline">{t.status}</Badge>
                </div>
                <div className="text-xs text-muted-foreground mt-1">{new Date(t.last_message_at).toLocaleString("pt-BR")}</div>
              </button>
            ))}
            {tickets.length === 0 && <div className="p-8 text-center text-muted-foreground text-sm">Você ainda não abriu tickets.</div>}
          </CardContent></Card>

          <Card>
            <CardContent className="p-4 flex flex-col h-[70vh]">
              {!selected ? <div className="flex-1 grid place-items-center text-muted-foreground">Selecione um ticket</div> : (
                <>
                  <div className="border-b pb-3">
                    <h3 className="font-semibold">{selected.subject}</h3>
                    <p className="text-xs text-muted-foreground">Status: {selected.status}</p>
                  </div>
                  <div className="flex-1 overflow-y-auto py-3 space-y-2">
                    {messages.map(m => (
                      <div key={m.id} className={`flex ${m.sender_role === "user" ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${m.sender_role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                          <p className="whitespace-pre-wrap">{m.body}</p>
                          <p className="text-[10px] opacity-70 mt-1">{new Date(m.created_at).toLocaleString("pt-BR")}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  {selected.status !== "closed" && (
                    <div className="flex gap-2 border-t pt-3">
                      <Textarea rows={2} value={reply} onChange={e => setReply(e.target.value)} placeholder="Escreva uma mensagem..." />
                      <Button onClick={send} disabled={!reply.trim()}><Send className="h-4 w-4" /></Button>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Novo ticket</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-2"><Label>Assunto</Label>
              <Input value={subject} onChange={e => setSubject(e.target.value)} /></div>
            <div className="space-y-2"><Label>Mensagem</Label>
              <Textarea rows={5} value={firstMsg} onChange={e => setFirstMsg(e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewOpen(false)}>Cancelar</Button>
            <Button onClick={openNew} disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} Abrir ticket</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}