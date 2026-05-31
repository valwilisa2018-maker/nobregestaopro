import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/producers")({
  component: () => {
    const qc = useQueryClient();
    const [open, setOpen] = useState(false);
    const [form, setForm] = useState({ name: "", specialty: "", phone: "", email: "" });
    const q = useQuery({ queryKey: ["producers-page"], queryFn: async () => (await supabase.from("producers").select("*").order("created_at", { ascending: false })).data ?? [] });
    const save = async () => {
      if (!form.name) return toast.error("Nome obrigatório");
      const { error } = await supabase.from("producers").insert(form);
      if (error) toast.error(error.message);
      else { toast.success("Produtor cadastrado"); setOpen(false); setForm({ name: "", specialty: "", phone: "", email: "" }); qc.invalidateQueries(); }
    };
    const toggleActive = async (id: string, active: boolean) => {
      const { error } = await supabase.from("producers").update({ active }).eq("id", id);
      if (error) toast.error(error.message);
      else { toast.success(active ? "Produtor ativado" : "Produtor desativado"); qc.invalidateQueries(); }
    };
    const remove = async (id: string, name: string) => {
      if (!window.confirm(`Excluir o produtor "${name}"? Esta ação não pode ser desfeita.`)) return;
      const { count: salesCount } = await supabase.from("sales").select("id", { count: "exact", head: true }).eq("producer_id", id);
      const { count: ordersCount } = await supabase.from("service_orders").select("id", { count: "exact", head: true }).eq("producer_id", id);
      const linked = (salesCount ?? 0) + (ordersCount ?? 0);
      if (linked > 0) {
        toast.error(`Não é possível excluir: ${linked} registro(s) vinculados. Desative-o em vez disso.`);
        return;
      }
      const { error } = await supabase.from("producers").delete().eq("id", id);
      if (error) toast.error(error.message);
      else { toast.success("Produtor excluído"); qc.invalidateQueries(); }
    };
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div><h1 className="text-3xl font-bold tracking-tight">Produtores</h1><p className="text-muted-foreground">Equipe de produção</p></div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus className="w-4 h-4 mr-2" />Novo produtor</Button></DialogTrigger>
            <DialogContent><DialogHeader><DialogTitle>Novo produtor</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>Nome</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
                <div><Label>Especialidade</Label><Input value={form.specialty} onChange={(e) => setForm({ ...form, specialty: e.target.value })} /></div>
                <div><Label>Telefone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
                <div><Label>E-mail</Label><Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
              </div>
              <DialogFooter><Button onClick={save}>Salvar</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
        <Card className="border-border/50" style={{ boxShadow: "var(--shadow-card)" }}><CardContent className="p-0">
          <Table>
            <TableHeader><TableRow><TableHead>Nome</TableHead><TableHead>Especialidade</TableHead><TableHead>Qualidade</TableHead><TableHead>Prazo médio</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Ações</TableHead></TableRow></TableHeader>
            <TableBody>
              {(q.data ?? []).map((p: any) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell>{p.specialty ?? "—"}</TableCell>
                  <TableCell>{Number(p.quality_score ?? 0).toFixed(1)} ⭐</TableCell>
                  <TableCell>{Number(p.average_delivery_days ?? 0).toFixed(1)} dias</TableCell>
                  <TableCell><Badge variant={p.active ? "default" : "secondary"}>{p.active ? "Ativo" : "Inativo"}</Badge></TableCell>
                  <TableCell className="text-right">
                    <div className="flex gap-1 justify-end">
                      <Button variant="outline" size="sm" onClick={() => toggleActive(p.id, !p.active)}>
                        {p.active ? "Desativar" : "Ativar"}
                      </Button>
                      <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => remove(p.id, p.name)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {(q.data ?? []).length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Sem produtores</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent></Card>
      </div>
    );
  },
});