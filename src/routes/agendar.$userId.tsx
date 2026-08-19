import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CalendarDays, CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/agendar/$userId")({
  head: () => ({
    meta: [
      { title: "Agendar horário" },
      { name: "description", content: "Reserve um horário de atendimento." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: BookingPage,
});

function BookingPage() {
  const { userId } = Route.useParams();
  const [form, setForm] = useState({ name: "", phone: "", email: "", when: "", notes: "" });
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name || !form.phone || !form.when) {
      toast.error("Preencha nome, WhatsApp e horário desejado");
      return;
    }
    setLoading(true);
    try {
      const r = await fetch("/api/public/booking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, ...form }),
      });
      const data = await r.json();
      if (!data.ok) throw new Error(data.error || "erro");
      setDone(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao enviar");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/10 via-background to-background p-4">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="text-center">
          <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-2">
            <CalendarDays className="h-6 w-6 text-primary" />
          </div>
          <CardTitle>Solicitar Agendamento</CardTitle>
        </CardHeader>
        <CardContent>
          {done ? (
            <div className="text-center py-6 space-y-3">
              <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto" />
              <h3 className="font-semibold text-lg">Solicitação enviada!</h3>
              <p className="text-sm text-muted-foreground">
                Recebemos seu pedido. Em breve entraremos em contato pelo WhatsApp para confirmar o
                horário.
              </p>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-3">
              <div>
                <Label>Nome completo *</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label>WhatsApp *</Label>
                <Input
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="(11) 99999-9999"
                  required
                />
              </div>
              <div>
                <Label>E-mail</Label>
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </div>
              <div>
                <Label>Horário desejado *</Label>
                <Input
                  value={form.when}
                  onChange={(e) => setForm({ ...form, when: e.target.value })}
                  placeholder="Ex: 15/07 às 14h"
                  required
                />
              </div>
              <div>
                <Label>Observações</Label>
                <Textarea
                  rows={3}
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Enviar solicitação"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
