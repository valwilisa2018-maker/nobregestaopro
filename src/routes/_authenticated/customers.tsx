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
import { MessageCircle, Search, Mail, Phone, Building2, FileText, Paperclip, Loader2 } from "lucide-react";
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

function onlyDigits(s?: string | null) {
  return (s ?? "").replace(/\D/g, "");
}

function waLink(phone?: string | null) {
  const d = onlyDigits(phone);
  if (!d) return null;
  const withCountry = d.length <= 11 ? `55${d}` : d;
  return `https://wa.me/${withCountry}`;
}

function CustomersPage() {
  const [year, setYear] = useState<string>("all");
  const [month, setMonth] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<any | null>(null);
  const [receiptsSale, setReceiptsSale] = useState<any | null>(null);
  const [receipts, setReceipts] = useState<any[]>([]);
  const [loadingReceipts, setLoadingReceipts] = useState(false);

  const openReceipts = async (sale: any) => {
    setReceiptsSale(sale);
    setReceipts([]);
    setLoadingReceipts(true);
    try {
      const { data, error } = await supabase
        .from("sale_receipts")
        .select("id, file_path, amount, paid_at, notes, created_at")
        .eq("sale_id", sale.id)
        .order("paid_at", { ascending: false });
      if (error) throw error;
      let list = data ?? [];
      // Fallback: include legacy receipt_url if no rows
      if (list.length === 0 && sale.receipt_url) {
        list = [{
          id: "legacy",
          file_path: sale.receipt_url,
          amount: sale.paid_amount ?? 0,
          paid_at: sale.sale_date,
          notes: "Comprovante inicial",
        }];
      }
      setReceipts(list);
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao carregar comprovantes");
    } finally {
      setLoadingReceipts(false);
    }
  };

  const openReceiptFile = async (filePath: string) => {
    const { data, error } = await supabase.storage.from("receipts").createSignedUrl(filePath, 60);
    if (error || !data?.signedUrl) { toast.error("Não foi possível abrir o comprovante"); return; }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

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

  const sellers = useQuery({
    queryKey: ["sellers-min"],
    queryFn: async () => {
      const { data } = await supabase.from("sellers").select("id, name");
      return data ?? [];
    },
  });
  const services = useQuery({
    queryKey: ["service-types-min"],
    queryFn: async () => {
      const { data } = await supabase.from("service_types").select("id, name");
      return data ?? [];
    },
  });
  const producers = useQuery({
    queryKey: ["producers-min"],
    queryFn: async () => {
      const { data } = await supabase.from("producers").select("id, name");
      return data ?? [];
    },
  });
  const packages = useQuery({
    queryKey: ["packages-min"],
    queryFn: async () => {
      const { data } = await supabase.from("packages").select("id, name");
      return data ?? [];
    },
  });

  const lookup = useMemo(() => ({
    sellers: new Map((sellers.data ?? []).map((s: any) => [s.id, s.name])),
    services: new Map((services.data ?? []).map((s: any) => [s.id, s.name])),
    producers: new Map((producers.data ?? []).map((p: any) => [p.id, p.name])),
    packages: new Map((packages.data ?? []).map((p: any) => [p.id, p.name])),
  }), [sellers.data, services.data, producers.data, packages.data]);

  const years = useMemo(() => {
    const set = new Set<string>();
    (q.data ?? []).forEach((c: any) => {
      (c.sales ?? []).forEach((s: any) => {
        if (s.sale_date) set.add(s.sale_date.slice(0, 4));
      });
    });
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [q.data]);

  const matchesDate = (s: any) => {
    if (!s.sale_date) return year === "all" && month === "all";
    const [y, m] = s.sale_date.split("-");
    if (year !== "all" && y !== year) return false;
    if (month !== "all" && m !== month) return false;
    return true;
  };

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (q.data ?? [])
      .map((c: any) => {
        const filteredSales = (c.sales ?? []).filter(matchesDate);
        const total = filteredSales.reduce((s: number, x: any) => s + Number(x.total_amount ?? 0), 0);
        const paid = filteredSales.reduce((s: number, x: any) => s + Number(x.paid_amount ?? 0), 0);
        return { ...c, _sales: filteredSales, _total: total, _paid: paid };
      })
      .filter((c: any) => (year === "all" && month === "all") || c._sales.length > 0)
      .filter((c: any) => {
        if (!term) return true;
        return [c.name, c.company, c.document, c.email, c.phone]
          .some((v) => (v ?? "").toString().toLowerCase().includes(term));
      });
  }, [q.data, year, month, search]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Clientes</h1>
        <p className="text-muted-foreground">Histórico completo de clientes e contratos</p>
      </div>

      <Card className="border-border/50">
        <CardContent className="p-4 grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <Label className="text-xs">Buscar</Label>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-8" placeholder="Nome, empresa, doc..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>
          <div>
            <Label className="text-xs">Ano</Label>
            <Select value={year} onValueChange={setYear}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os anos</SelectItem>
                {years.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Mês</Label>
            <Select value={month} onValueChange={setMonth}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os meses</SelectItem>
                {MONTHS.map((name, i) => {
                  const v = String(i + 1).padStart(2, "0");
                  return <SelectItem key={v} value={v}>{name}</SelectItem>;
                })}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button variant="outline" className="w-full" onClick={() => { setYear("all"); setMonth("all"); setSearch(""); }}>
              Limpar filtros
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/50" style={{ boxShadow: "var(--shadow-card)" }}>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Empresa</TableHead>
                <TableHead>Documento</TableHead>
                <TableHead>Contato</TableHead>
                <TableHead className="text-right">Vendas</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((c: any) => {
                const wa = waLink(c.phone);
                return (
                  <TableRow key={c.id} className="cursor-pointer hover:bg-muted/40" onClick={() => setSelected(c)}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell>{c.company ?? "—"}</TableCell>
                    <TableCell>{c.document ?? "—"}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2 text-sm">
                        {c.phone ?? "—"}
                        {wa && (
                          <a
                            href={wa}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-[#25D366] text-white hover:opacity-90"
                            title="Abrir no WhatsApp"
                          >
                            <MessageCircle className="w-3.5 h-3.5" />
                          </a>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">{c.email}</div>
                    </TableCell>
                    <TableCell className="text-right">{c._sales.length}</TableCell>
                    <TableCell className="text-right font-medium">{formatCurrency(c._total)}</TableCell>
                  </TableRow>
                );
              })}
              {rows.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Nenhum cliente encontrado para o filtro selecionado</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selected?.name}</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                {selected.company && (
                  <div className="flex items-center gap-2"><Building2 className="w-4 h-4 text-muted-foreground" />{selected.company}</div>
                )}
                {selected.document && (
                  <div className="flex items-center gap-2"><FileText className="w-4 h-4 text-muted-foreground" />{selected.document}</div>
                )}
                {selected.phone && (
                  <div className="flex items-center gap-2">
                    <Phone className="w-4 h-4 text-muted-foreground" />
                    <span>{selected.phone}</span>
                    {waLink(selected.phone) && (
                      <a
                        href={waLink(selected.phone)!}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-[#25D366] text-white hover:opacity-90"
                      >
                        <MessageCircle className="w-3 h-3" /> WhatsApp
                      </a>
                    )}
                  </div>
                )}
                {selected.email && (
                  <div className="flex items-center gap-2"><Mail className="w-4 h-4 text-muted-foreground" />{selected.email}</div>
                )}
              </div>

              {(() => {
                const fullyPaid = selected._paid >= selected._total && selected._total > 0;
                const toneClass = fullyPaid
                  ? "border-emerald-500/60 bg-emerald-500/10"
                  : "border-red-500/60 bg-red-500/10";
                const textTone = fullyPaid ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400";
                return (
                  <div className="grid grid-cols-3 gap-3">
                    <Card><CardContent className="p-3"><div className="text-xs text-muted-foreground">Vendas</div><div className="text-xl font-bold">{selected._sales.length}</div></CardContent></Card>
                    <Card className={toneClass}><CardContent className="p-3"><div className="text-xs text-muted-foreground">Total contratado</div><div className={`text-xl font-bold ${textTone}`}>{formatCurrency(selected._total)}</div></CardContent></Card>
                    <Card className={toneClass}><CardContent className="p-3"><div className="text-xs text-muted-foreground">Pago</div><div className={`text-xl font-bold ${textTone}`}>{formatCurrency(selected._paid)}</div></CardContent></Card>
                  </div>
                );
              })()}

              <div>
                <h3 className="font-semibold mb-2">Histórico de compras</h3>
                <div className="border rounded-md">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Data</TableHead>
                        <TableHead>Serviço</TableHead>
                        <TableHead>Vendedor</TableHead>
                        <TableHead>Produtor</TableHead>
                        <TableHead className="text-right">Qtd</TableHead>
                        <TableHead className="text-right">Valor</TableHead>
                        <TableHead className="text-right">Pago</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selected._sales.length === 0 && (
                        <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-6">Sem compras no período selecionado</TableCell></TableRow>
                      )}
                      {selected._sales
                        .slice()
                        .sort((a: any, b: any) => (b.sale_date ?? "").localeCompare(a.sale_date ?? ""))
                        .map((s: any) => (
                          <TableRow key={s.id}>
                            <TableCell className="whitespace-nowrap">{fmtDate(s.sale_date)}</TableCell>
                            <TableCell>
                              {s.package_id
                                ? <span>{lookup.packages.get(s.package_id) ?? "Pacote"} <Badge variant="outline" className="ml-1">pacote</Badge></span>
                                : (lookup.services.get(s.service_type_id) ?? "—")}
                            </TableCell>
                            <TableCell>{lookup.sellers.get(s.seller_id) ?? "—"}</TableCell>
                            <TableCell>{lookup.producers.get(s.producer_id) ?? "—"}</TableCell>
                            <TableCell className="text-right">{s.service_quantity ?? 1}</TableCell>
                            <TableCell className="text-right">{formatCurrency(s.total_amount)}</TableCell>
                            <TableCell className="text-right">{formatCurrency(s.paid_amount)}</TableCell>
                            <TableCell>
                              <Badge variant={
                                s.payment_status === "pago" ? "default" :
                                s.payment_status === "parcial" ? "secondary" : "outline"
                              }>
                                {s.payment_status}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}