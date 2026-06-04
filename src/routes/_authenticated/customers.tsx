import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MessageCircle, Search, Mail, Phone, Building2, FileText, Paperclip, Loader2, LayoutGrid, List, User } from "lucide-react";
import { formatCurrency } from "@/lib/auth";
import { fmtDate } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/customers")({
  component: CustomersPage,
});

const MONTHS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

function waLink(phone?: string | null) {
  const d = (phone ?? "").replace(/\D/g, "");
  if (!d) return null;
  return `https://wa.me/${d.length <= 11 ? `55${d}` : d}`;
}

function CustomersPage() {
  const [year, setYear] = useState<string>("all");
  const [month, setMonth] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<any | null>(null);
  const [receiptsSale, setReceiptsSale] = useState<any | null>(null);
  const [receipts, setReceipts] = useState<any[]>([]);
  const [loadingReceipts, setLoadingReceipts] = useState(false);
  const [viewMode, setViewMode] = useState<"table" | "card">("table");

  const q = useQuery({
    queryKey: ["customers-all"],
    queryFn: async () => {
      const { data } = await supabase
        .from("customers")
        .select("*, sales(id, sale_date, total_amount, paid_amount, payment_status, payment_method, service_quantity, notes, seller_id, service_type_id, producer_id, package_id, receipt_url, created_at)")
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const sellers = useQuery({ queryKey: ["sellers-min"], queryFn: async () => (await supabase.from("sellers").select("id, name")).data ?? [] });
  const services = useQuery({ queryKey: ["service-types-min"], queryFn: async () => (await supabase.from("service_types").select("id, name")).data ?? [] });
  const producers = useQuery({ queryKey: ["producers-min"], queryFn: async () => (await supabase.from("producers").select("id, name")).data ?? [] });
  const packages = useQuery({ queryKey: ["packages-min"], queryFn: async () => (await supabase.from("packages").select("id, name")).data ?? [] });

  const lookup = useMemo(() => ({
    sellers: new Map((sellers.data ?? []).map((s: any) => [s.id, s.name])),
    services: new Map((services.data ?? []).map((s: any) => [s.id, s.name])),
    producers: new Map((producers.data ?? []).map((p: any) => [p.id, p.name])),
    packages: new Map((packages.data ?? []).map((p: any) => [p.id, p.name])),
  }), [sellers.data, services.data, producers.data, packages.data]);

  const years = useMemo(() => {
    const set = new Set<string>();
    (q.data ?? []).forEach((c: any) => (c.sales ?? []).forEach((s: any) => s.sale_date && set.add(s.sale_date.slice(0, 4))));
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [q.data]);

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (q.data ?? [])
      .map((c: any) => {
        const filteredSales = (c.sales ?? []).filter((s: any) => {
          if (!s.sale_date) return year === "all" && month === "all";
          const [y, m] = s.sale_date.split("-");
          return (year === "all" || y === year) && (month === "all" || m === month);
        });
        const total = filteredSales.reduce((s: number, x: any) => s + Number(x.total_amount ?? 0), 0);
        const paid = filteredSales.reduce((s: number, x: any) => s + Number(x.paid_amount ?? 0), 0);
        return { ...c, _sales: filteredSales, _total: total, _paid: paid };
      })
      .filter((c: any) => (year === "all" && month === "all") || c._sales.length > 0)
      .filter((c: any) => !term || [c.name, c.company, c.document, c.email, c.phone].some((v) => (v ?? "").toString().toLowerCase().includes(term)));
  }, [q.data, year, month, search]);

  const openReceipts = async (sale: any) => {
    setReceiptsSale(sale); setReceipts([]); setLoadingReceipts(true);
    try {
      const { data, error } = await supabase.from("sale_receipts").select("*").eq("sale_id", sale.id).order("paid_at", { ascending: false });
      if (error) throw error;
      let list = data ?? [];
      if (list.length === 0 && sale.receipt_url) list = [{ id: "legacy", file_path: sale.receipt_url, amount: sale.paid_amount ?? 0, paid_at: sale.sale_date, notes: "Comprovante inicial", created_at: new Date().toISOString(), sale_id: sale.id, uploaded_by: null } as any];
      setReceipts(list);
    } catch (e: any) { toast.error(e.message ?? "Erro ao carregar comprovantes"); } finally { setLoadingReceipts(false); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-3xl font-bold tracking-tight">Clientes</h1><p className="text-muted-foreground">Histórico completo de clientes e contratos</p></div>
        <div className="flex items-center bg-muted rounded-lg p-1">
          <Button variant={viewMode === "table" ? "secondary" : "ghost"} size="sm" className="h-8 w-8 p-0" onClick={() => setViewMode("table")}><List className="h-4 w-4" /></Button>
          <Button variant={viewMode === "card" ? "secondary" : "ghost"} size="sm" className="h-8 w-8 p-0" onClick={() => setViewMode("card")}><LayoutGrid className="h-4 w-4" /></Button>
        </div>
      </div>
      <Card className="border-border/50"><CardContent className="p-4 grid grid-cols-1 md:grid-cols-4 gap-3">
        <div><Label className="text-xs">Buscar</Label><div className="relative"><Search className="w-4 h-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" /><Input className="pl-8" placeholder="Nome, empresa, doc..." value={search} onChange={(e) => setSearch(e.target.value)} /></div></div>
        <div><Label className="text-xs">Ano</Label><Select value={year} onValueChange={setYear}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todos os anos</SelectItem>{years.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}</SelectContent></Select></div>
        <div><Label className="text-xs">Mês</Label><Select value={month} onValueChange={setMonth}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todos os meses</SelectItem>{MONTHS.map((name, i) => (<SelectItem key={String(i + 1).padStart(2, "0")} value={String(i + 1).padStart(2, "0")}>{name}</SelectItem>))}</SelectContent></Select></div>
        <div className="flex items-end"><Button variant="outline" className="w-full" onClick={() => { setYear("all"); setMonth("all"); setSearch(""); }}>Limpar filtros</Button></div>
      </CardContent></Card>
      {viewMode === "table" ? (
        <Card className="border-border/50"><CardContent className="p-0">
          <Table><TableHeader><TableRow><TableHead>Cliente</TableHead><TableHead>Empresa</TableHead><TableHead>Documento</TableHead><TableHead>Contato</TableHead><TableHead className="text-right">Vendas</TableHead><TableHead className="text-right">Total</TableHead></TableRow></TableHeader>
            <TableBody>
              {rows.map((c: any) => (<TableRow key={c.id} className="cursor-pointer hover:bg-muted/40" onClick={() => setSelected(c)}><TableCell className="font-medium">{c.name}</TableCell><TableCell>{c.company ?? "—"}</TableCell><TableCell>{c.document ?? "—"}</TableCell><TableCell><div className="flex items-center gap-2 text-sm">{c.phone ?? "—"}{waLink(c.phone) && (<a href={waLink(c.phone)!} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-[#25D366] text-white hover:opacity-90"><MessageCircle className="w-3.5 h-3.5" /></a>)}</div><div className="text-xs text-muted-foreground">{c.email}</div></TableCell><TableCell className="text-right">{c._sales.length}</TableCell><TableCell className="text-right font-medium">{formatCurrency(c._total)}</TableCell></TableRow>))}
              {rows.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Nenhum cliente encontrado</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {rows.map((c: any) => (<Card key={c.id} className="border-border/50 hover:shadow-md transition-shadow cursor-pointer" onClick={() => setSelected(c)}><CardContent className="p-4 space-y-4"><div className="flex items-start justify-between"><div className="flex items-center gap-3"><div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary"><User className="h-5 w-5" /></div><div><h3 className="font-bold leading-tight">{c.name}</h3><p className="text-xs text-muted-foreground">{c.company ?? "Empresa não informada"}</p></div></div><Badge variant="secondary">{c._sales.length} vendas</Badge></div><div className="space-y-2 text-sm"><div className="flex items-center gap-2"><FileText className="h-3.5 w-3.5 text-muted-foreground" /><span className="text-muted-foreground">Doc:</span><span>{c.document ?? "—"}</span></div><div className="flex items-center gap-2"><Mail className="h-3.5 w-3.5 text-muted-foreground" /><span className="truncate">{c.email ?? "—"}</span></div><div className="flex items-center gap-2"><Phone className="h-3.5 w-3.5 text-muted-foreground" /><span>{c.phone ?? "—"}</span>{waLink(c.phone) && (<a href={waLink(c.phone)!} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="ml-auto inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-[#25D366] text-white hover:opacity-90"><MessageCircle className="w-3 h-3" /> WhatsApp</a>)}</div></div><div className="pt-3 border-t flex justify-between items-center"><span className="text-xs text-muted-foreground uppercase font-bold tracking-wider">Total Contratado</span><span className="font-bold text-primary">{formatCurrency(c._total)}</span></div></CardContent></Card>))}
          {rows.length === 0 && <div className="col-span-full py-12 text-center text-muted-foreground italic">Nenhum cliente encontrado</div>}
        </div>
      )}
      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}><DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>{selected?.name}</DialogTitle></DialogHeader>{selected && (<div className="space-y-5"><div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">{selected.company && <div className="flex items-center gap-2"><Building2 className="w-4 h-4 text-muted-foreground" />{selected.company}</div>}{selected.document && <div className="flex items-center gap-2"><FileText className="w-4 h-4 text-muted-foreground" />{selected.document}</div>}{selected.phone && <div className="flex items-center gap-2"><Phone className="w-4 h-4 text-muted-foreground" /><span>{selected.phone}</span>{waLink(selected.phone) && <a href={waLink(selected.phone)!} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-[#25D366] text-white hover:opacity-90"><MessageCircle className="w-3 h-3" /> WhatsApp</a>}</div>}{selected.email && <div className="flex items-center gap-2"><Mail className="w-4 h-4 text-muted-foreground" />{selected.email}</div>}</div><div className="grid grid-cols-3 gap-3"><Card><CardContent className="p-3"><div className="text-xs text-muted-foreground">Vendas</div><div className="text-xl font-bold">{selected._sales.length}</div></CardContent></Card><Card><CardContent className="p-3"><div className="text-xs text-muted-foreground">Total contratado</div><div className="text-xl font-bold">{formatCurrency(selected._total)}</div></CardContent></Card><Card><CardContent className="p-3"><div className="text-xs text-muted-foreground">Pago</div><div className="text-xl font-bold">{formatCurrency(selected._paid)}</div></CardContent></Card></div><div className="border rounded-md"><Table><TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Serviço</TableHead><TableHead className="text-right">Valor</TableHead><TableHead>Status</TableHead><TableHead>Comprov.</TableHead></TableRow></TableHeader><TableBody>{selected._sales.sort((a: any, b: any) => (b.sale_date ?? "").localeCompare(a.sale_date ?? "")).map((s: any) => (<TableRow key={s.id}><TableCell className="whitespace-nowrap">{fmtDate(s.sale_date)}</TableCell><TableCell>{s.package_id ? <span>{lookup.packages.get(s.package_id) ?? "Pacote"} <Badge variant="outline" className="ml-1">pacote</Badge></span> : (lookup.services.get(s.service_type_id) ?? "—")}</TableCell><TableCell className="text-right">{formatCurrency(s.total_amount)}</TableCell><TableCell><Badge variant={s.payment_status === "pago_total" ? "default" : "secondary"}>{s.payment_status}</Badge></TableCell><TableCell><Button size="sm" variant="outline" onClick={() => openReceipts(s)}><Paperclip className="w-3.5 h-3.5 mr-1" /> Ver</Button></TableCell></TableRow>))}</TableBody></Table></div></div>)}</DialogContent></Dialog>
      <Dialog open={!!receiptsSale} onOpenChange={(o) => !o && setReceiptsSale(null)}><DialogContent className="max-w-lg"><DialogHeader><DialogTitle>Comprovantes da venda</DialogTitle></DialogHeader>{loadingReceipts ? <div className="py-8 text-center"><Loader2 className="w-5 h-5 animate-spin inline" /></div> : receipts.length === 0 ? <div className="py-6 text-center text-sm text-muted-foreground">Nenhum comprovante anexado.</div> : <div className="space-y-2">{receipts.map((r) => (<div key={r.id} className="flex items-center justify-between border rounded-md px-3 py-2"><div className="text-sm"><div className="font-medium">{fmtDate(r.paid_at)} — {formatCurrency(r.amount)}</div>{r.notes && <div className="text-xs text-muted-foreground">{r.notes}</div>}</div><Button size="sm" variant="outline" onClick={async () => { const { data } = await supabase.storage.from("receipts").createSignedUrl(r.file_path, 60); window.open(data?.signedUrl, "_blank"); }}><Paperclip className="w-3.5 h-3.5 mr-1" /> Abrir</Button></div>))}</div>}</DialogContent></Dialog>
    </div>
  );
}
