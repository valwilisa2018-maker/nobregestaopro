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
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated/sellers")({
  component: SellersPage,
});

function SellersPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", email: "", monthly_goal: "0", commission_rate: "0" });
  const q = useQuery({
    queryKey: ["sellers-page"],
    queryFn: async () => (await supabase.from("sellers").select("*").order("created_at", { ascending: false })).data ?? [],
  });
  const save = async () => {
    if (!form.name) return toast.error("Nome obrigatório");
    const { error } = await supabase.from("sellers").insert({
      name: form.name, phone: form.phone || null, email: form.email || null,
      monthly_goal: Number(form.monthly_goal), commission_rate: Number(form.commission_rate),
    });
    if (error) toast.error(error.message);
    else { toast.success("Vendedor cadastrado"); setOpen(false); setForm({ name: "", phone: "", email: "", monthly_goal: "0", commission_rate: "0" }); qc.invalidateQueries(); }
  };
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-3xl font-bold tracking-tight">Vendedores</h1><p className="text-muted-foreground">Equipe comercial</p></div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="w-4 h-4 mr-2" />Novo vendedor</Button></DialogTrigger>
          <DialogContent><DialogHeader><DialogTitle>Novo vendedor</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Nome</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div><Label>Telefone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
              <div><Label>E-mail</Label><Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
              <div><Label>Meta mensal</Label><Input type="number" value={form.monthly_goal} onChange={(e) => setForm({ ...form, monthly_goal: e.target.value })} /></div>
              <div><Label>Comissão (%)</Label><Input type="number" value={form.commission_rate} onChange={(e) => setForm({ ...form, commission_rate: e.target.value })} /></div>
            </div>
            <DialogFooter><Button onClick={save}>Salvar</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <Card className="border-border/50" style={{ boxShadow: "var(--shadow-card)" }}><CardContent className="p-0">
        <Table>
          <TableHeader><TableRow><TableHead>Nome</TableHead><TableHead>Contato</TableHead><TableHead className="text-right">Meta</TableHead><TableHead>Comissão</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
          <TableBody>
            {(q.data ?? []).map((s: any) => (
              <TableRow key={s.id}>
                <TableCell className="font-medium">{s.name}</TableCell>
                <TableCell><div className="text-sm">{s.phone}</div><div className="text-xs text-muted-foreground">{s.email}</div></TableCell>
                <TableCell className="text-right">{formatCurrency(s.monthly_goal)}</TableCell>
                <TableCell>{s.commission_rate}%</TableCell>
                <TableCell><Badge variant={s.active ? "default" : "secondary"}>{s.active ? "Ativo" : "Inativo"}</Badge></TableCell>
              </TableRow>
            ))}
            {(q.data ?? []).length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Sem vendedores</TableCell></TableRow>}
          </TableBody>
        </Table>
      </CardContent></Card>
    </div>
  );
}