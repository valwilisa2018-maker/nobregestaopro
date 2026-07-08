import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageShell } from "@/components/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Bell, Loader2, Send } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_master/notifications")({
  head: () => ({ meta: [{ title: "Notificações — Admin Master" }] }),
  component: Page,
});

type Profile = { id: string; full_name: string | null };

function Page() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [target, setTarget] = useState<string>("all");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [link, setLink] = useState("");
  const [type, setType] = useState("info");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    supabase.from("profiles").select("id,full_name").order("full_name").then(({ data }) =>
      setProfiles((data as Profile[]) ?? []));
  }, []);

  const send = async () => {
    if (!title.trim() || !body.trim()) return toast.error("Título e mensagem obrigatórios");
    setSending(true);
    const { data: { user } } = await supabase.auth.getUser();
    const recipients = target === "all" ? profiles.map(p => p.id) : [target];
    const rows = recipients.map(user_id => ({ user_id, title, body, type, link: link || null, created_by: user?.id ?? null }));
    const { error } = await supabase.from("notifications").insert(rows);
    setSending(false);
    if (error) return toast.error(error.message);
    toast.success(`Notificação enviada para ${recipients.length} usuário(s)`);
    setTitle(""); setBody(""); setLink("");
  };

  return (
    <PageShell title="Enviar notificações" description="Notifique um cliente específico ou todos ao mesmo tempo." icon={<Bell className="h-6 w-6" />} status="ativo">
      <Card><CardContent className="p-6 space-y-4 max-w-2xl">
        <div className="space-y-2"><Label>Destinatário</Label>
          <Select value={target} onValueChange={setTarget}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os clientes</SelectItem>
              {profiles.map(p => <SelectItem key={p.id} value={p.id}>{p.full_name || p.id.slice(0, 8)}</SelectItem>)}
            </SelectContent>
          </Select></div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2"><Label>Título</Label>
            <Input value={title} onChange={e => setTitle(e.target.value)} /></div>
          <div className="space-y-2"><Label>Tipo</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="info">Info</SelectItem>
                <SelectItem value="success">Sucesso</SelectItem>
                <SelectItem value="warning">Aviso</SelectItem>
                <SelectItem value="alert">Alerta</SelectItem>
              </SelectContent>
            </Select></div>
        </div>
        <div className="space-y-2"><Label>Mensagem</Label>
          <Textarea rows={4} value={body} onChange={e => setBody(e.target.value)} /></div>
        <div className="space-y-2"><Label>Link (opcional)</Label>
          <Input value={link} onChange={e => setLink(e.target.value)} placeholder="/dashboard" /></div>
        <Button onClick={send} disabled={sending} className="w-full">
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Enviar
        </Button>
      </CardContent></Card>
    </PageShell>
  );
}