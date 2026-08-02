import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  sellersMinQuery,
  serviceTypesMinQuery,
  producersMinQuery,
  packagesMinQuery,
} from "@/lib/queries/lookups";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  MessageCircle,
  Search,
  Mail,
  Phone,
  Building2,
  FileText,
  Paperclip,
  Loader2,
  LayoutGrid,
  List,
  User,
  Trash2,
  Users,
} from "lucide-react";
import { PageHero } from "@/components/page-hero";
import { formatCurrency, dateKey, toDateKey } from "@/lib/format";
import { fmtDate } from "@/lib/format";
import { toast } from "sonner";
import { z } from "zod";
import { waHref, formatPhoneBR } from "@/lib/phone";
import { VirtualTableRows } from "@/components/virtual-list";
import { TableSkeletonRows, TableEmptyRow, CardGridSkeleton, EmptyState } from "@/components/list-states";

const customerSearchSchema = z.object({
  search: z.string().optional(),
});

export const Route = createFileRoute("/_authenticated/customers")({
  validateSearch: (search) => customerSearchSchema.parse(search),
  component: CustomersPage,
});

const MONTHS = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

const waLink = (phone?: string | null) => waHref(phone);

function CustomersPage() {
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const { search: searchParam } = Route.useSearch();
  const queryClient = useQueryClient();
  const [year, setYear] = useState<string>("all");
  const [month, setMonth] = useState<string>("all");
  const [period, setPeriod] = useState<string>("all");
  const [sellerFilter, setSellerFilter] = useState<string>("all");
  const [producerFilter, setProducerFilter] = useState<string>("all");
  const [paymentMethodFilter, setPaymentMethodFilter] = useState<string>("all");
  const [search, setSearch] = useState(searchParam || "");
  const [selected, setSelected] = useState<any | null>(null);
  const [receiptsSale, setReceiptsSale] = useState<any | null>(null);
  const [receipts, setReceipts] = useState<any[]>([]);
  const [loadingReceipts, setLoadingReceipts] = useState(false);
  const [viewMode, setViewMode] = useState<"table" | "card">("table");

  useEffect(() => {
    if (searchParam) setSearch(searchParam);
  }, [searchParam]);

  const q = useQuery({
    queryKey: ["customers-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select(
          "*, sales(id, sale_date, total_amount, paid_amount, payment_status, payment_method, service_quantity, notes, seller_id, service_type_id, producer_id, package_id, receipt_url, created_at)",
        )
        .order("created_at", { ascending: false });
      if (error) {
        toast.error("Erro ao carregar clientes: " + error.message);
        throw error;
      }
      return data ?? [];
    },
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    staleTime: 0,
  });

  // Refetch when receipts/sales change anywhere (e.g. valor recebido em pending-payments)
  useEffect(() => {
    const ch = supabase
      .channel("customers-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "sale_receipts" }, () => {
        queryClient.invalidateQueries({ queryKey: ["customers-all"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "sales" }, () => {
        queryClient.invalidateQueries({ queryKey: ["customers-all"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [queryClient]);

  const sellers = useQuery(sellersMinQuery());
  const services = useQuery(serviceTypesMinQuery());
  const producers = useQuery(producersMinQuery());
  const packages = useQuery(packagesMinQuery());

  const lookup = useMemo(
    () => ({
      sellers: new Map((sellers.data ?? []).map((s: any) => [s.id, s.name])),
      services: new Map((services.data ?? []).map((s: any) => [s.id, s.name])),
      producers: new Map((producers.data ?? []).map((p: any) => [p.id, p.name])),
      packages: new Map((packages.data ?? []).map((p: any) => [p.id, p.name])),
    }),
    [sellers.data, services.data, producers.data, packages.data],
  );

  const years = useMemo(() => {
    const set = new Set<string>();
    (q.data ?? []).forEach((c: any) =>
      (c.sales ?? []).forEach((s: any) => s.sale_date && set.add(s.sale_date.slice(0, 4))),
    );
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [q.data]);

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    // Datas comparadas como texto "YYYY-MM-DD" para evitar deslocamento de fuso
    const now = new Date();
    const today = dateKey(now);
    const startOfWeek = dateKey(
      new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay()),
    );
    const startOfMonth = dateKey(new Date(now.getFullYear(), now.getMonth(), 1));
    const startOfYear = dateKey(new Date(now.getFullYear(), 0, 1));

    return (q.data ?? [])
      .map((c: any) => {
        const filteredSales = (c.sales ?? []).filter((s: any) => {
          // Date/Period Filter
          if (period !== "all") {
            if (!s.sale_date) return false;
            const saleKey = toDateKey(s.sale_date);
            if (period === "today" && saleKey !== today) return false;
            if (period === "week" && saleKey < startOfWeek) return false;
            if (period === "month" && saleKey < startOfMonth) return false;
            if (period === "year" && saleKey < startOfYear) return false;
          } else {
            if (!s.sale_date) return year === "all" && month === "all";
            const [y, m] = s.sale_date.split("-");
            if ((year !== "all" && y !== year) || (month !== "all" && m !== month)) return false;
          }

          // Seller Filter
          if (sellerFilter !== "all" && s.seller_id !== sellerFilter) return false;

          // Producer Filter
          if (producerFilter !== "all" && s.producer_id !== producerFilter) return false;

          // Payment Method Filter
          if (paymentMethodFilter !== "all" && s.payment_method !== paymentMethodFilter)
            return false;

          return true;
        });
        const total = filteredSales.reduce(
          (s: number, x: any) => s + Number(x.total_amount ?? 0),
          0,
        );
        const paid = filteredSales.reduce((s: number, x: any) => s + Number(x.paid_amount ?? 0), 0);
        return { ...c, _sales: filteredSales, _total: total, _paid: paid };
      })
      .filter(
        (c: any) =>
          (year === "all" &&
            month === "all" &&
            period === "all" &&
            sellerFilter === "all" &&
            producerFilter === "all" &&
            paymentMethodFilter === "all") ||
          c._sales.length > 0,
      )
      .filter(
        (c: any) =>
          !term ||
          [c.name, c.company, c.document, c.email, c.phone].some((v) =>
            (v ?? "").toString().toLowerCase().includes(term),
          ),
      );
  }, [q.data, year, month, period, sellerFilter, producerFilter, paymentMethodFilter, search]);

  const openReceipts = async (sale: any) => {
    setReceiptsSale(sale);
    setReceipts([]);
    setLoadingReceipts(true);
    try {
      const { data, error } = await supabase
        .from("sale_receipts")
        .select("*")
        .eq("sale_id", sale.id)
        .order("paid_at", { ascending: false });
      if (error) throw error;
      let list = data ?? [];
      if (list.length === 0 && sale.receipt_url)
        list = [
          {
            id: "legacy",
            file_path: sale.receipt_url,
            amount: sale.paid_amount ?? 0,
            paid_at: sale.sale_date,
            notes: "Comprovante inicial",
            created_at: new Date().toISOString(),
            sale_id: sale.id,
            uploaded_by: null,
          } as any,
        ];
      setReceipts(list);
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao carregar comprovantes");
    } finally {
      setLoadingReceipts(false);
    }
  };

  const deleteCustomer = async (id: string, name: string) => {
    if (
      !window.confirm(
        `Excluir o cliente "${name}"? Esta ação removerá o cliente e todas as suas vendas e pedidos de serviço vinculados. Esta ação não pode ser desfeita.`,
      )
    )
      return;

    try {
      // Deletar dependências primeiro (embora o ideal seria ter ON DELETE CASCADE no banco, vamos ser cautelosos)
      // Primeiro buscamos as vendas do cliente
      const { data: customerSales } = await supabase
        .from("sales")
        .select("id")
        .eq("customer_id", id);

      if (customerSales && customerSales.length > 0) {
        const saleIds = customerSales.map((s) => s.id);

        // Deletar pedidos de serviço, faturas e comprovantes vinculados às vendas
        await supabase.from("service_orders").delete().in("sale_id", saleIds);
        await supabase.from("invoices").delete().in("sale_id", saleIds);
        await supabase.from("sale_receipts").delete().in("sale_id", saleIds);

        // Deletar as vendas
        await supabase.from("sales").delete().eq("customer_id", id);
      }

      // Finalmente deletar o cliente
      const { error } = await supabase.from("customers").delete().eq("id", id);

      if (error) throw error;

      toast.success("Cliente e dados vinculados excluídos com sucesso");
      setSelected(null);
      q.refetch();
    } catch (e: any) {
      console.error("Erro ao excluir cliente:", e);
      toast.error("Erro ao excluir cliente: " + e.message);
    }
  };

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow="CRM"
        icon={Users}
        title="Clientes"
        description="Histórico completo de clientes e contratos"
        actions={
          <div className="flex items-center bg-muted rounded-lg p-1">
            <Button
              variant={viewMode === "table" ? "secondary" : "ghost"}
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => setViewMode("table")}
            >
              <List className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === "card" ? "secondary" : "ghost"}
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => setViewMode("card")}
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
          </div>
        }
      />
      <Card className="border-border/50">
        <CardContent className="p-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="md:col-span-2">
              <Label className="text-xs">Buscar Cliente</Label>
              <div className="relative">
                <Search className="w-4 h-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-8"
                  placeholder="Nome, empresa, doc, email..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
            <div>
              <Label className="text-xs">Período</Label>
              <Select
                value={period}
                onValueChange={(v) => {
                  setPeriod(v);
                  if (v !== "all") {
                    setYear("all");
                    setMonth("all");
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os períodos</SelectItem>
                  <SelectItem value="today">Hoje</SelectItem>
                  <SelectItem value="week">Esta Semana</SelectItem>
                  <SelectItem value="month">Este Mês</SelectItem>
                  <SelectItem value="year">Este Ano</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  setYear("all");
                  setMonth("all");
                  setPeriod("all");
                  setSearch("");
                  setSellerFilter("all");
                  setProducerFilter("all");
                  setPaymentMethodFilter("all");
                }}
              >
                Limpar filtros
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-3 pt-2 border-t">
            <div>
              <Label className="text-xs font-semibold">Vendedor</Label>
              <Select value={sellerFilter} onValueChange={setSellerFilter}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {sellers.data?.map((s: any) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs font-semibold">Produtor</Label>
              <Select value={producerFilter} onValueChange={setProducerFilter}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {producers.data?.map((p: any) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs font-semibold">Pagamento</Label>
              <Select value={paymentMethodFilter} onValueChange={setPaymentMethodFilter}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="pix">PIX</SelectItem>
                  <SelectItem value="credit_card">Cartão de Crédito</SelectItem>
                  <SelectItem value="bank_transfer">Transferência</SelectItem>
                  <SelectItem value="cash">Dinheiro</SelectItem>
                  <SelectItem value="link">Link de Pagamento</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {period === "all" && (
              <>
                <div>
                  <Label className="text-xs font-semibold">Ano</Label>
                  <Select value={year} onValueChange={setYear}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      {years.map((y) => (
                        <SelectItem key={y} value={y}>
                          {y}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs font-semibold">Mês</Label>
                  <Select value={month} onValueChange={setMonth}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      {MONTHS.map((name, i) => (
                        <SelectItem
                          key={String(i + 1).padStart(2, "0")}
                          value={String(i + 1).padStart(2, "0")}
                        >
                          {name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
          </div>
        </CardContent>
      </Card>
      {viewMode === "table" ? (
        <Card className="border-border/50">
          <CardContent className="p-0">
            <div ref={tableScrollRef} className="max-h-[70vh] overflow-auto">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-card">
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Empresa</TableHead>
                  <TableHead>Documento</TableHead>
                  <TableHead>Contato</TableHead>
                  <TableHead className="text-right">Vendas</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Status Pgto</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {q.isLoading && <TableSkeletonRows rows={8} columns={8} />}
                {!q.isLoading && (
                <VirtualTableRows
                  items={rows as any[]}
                  scrollRef={tableScrollRef}
                  colSpan={8}
                  estimateSize={72}
                  keyFor={(c: any) => c.id}
                  renderRow={(c: any) => {
                  const isPaid = c._paid >= c._total && c._total > 0;
                  const isPartial = c._paid > 0 && c._paid < c._total;
                  const isPending = c._paid === 0 && c._total > 0;

                  return (
                    <TableRow
                      className="cursor-pointer hover:bg-muted/40"
                      onClick={() => setSelected(c)}
                    >
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell>{c.company ?? "—"}</TableCell>
                      <TableCell>{c.document ?? "—"}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 text-sm">
                          {c.phone ? formatPhoneBR(c.phone) : "—"}
                          {waLink(c.phone) && (
                            <a
                              href={waLink(c.phone)!}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-[#25D366] text-white hover:opacity-90"
                            >
                              <MessageCircle className="w-3.5 h-3.5" />
                            </a>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground">{c.email}</div>
                      </TableCell>
                      <TableCell className="text-right">{c._sales.length}</TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(c._total)}
                      </TableCell>
                      <TableCell>
                        {isPaid ? (
                          <Badge className="bg-green-100 text-green-700 border-green-200 hover:bg-green-100">
                            Pago Total
                          </Badge>
                        ) : isPartial ? (
                          <Badge className="bg-orange-100 text-orange-700 border-orange-200 hover:bg-orange-100">
                            Pago Parcial
                          </Badge>
                        ) : isPending ? (
                          <Badge className="bg-red-100 text-red-700 border-red-200 hover:bg-red-100">
                            Pendente
                          </Badge>
                        ) : (
                          <Badge variant="outline">—</Badge>
                        )}
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                          onClick={() => deleteCustomer(c.id, c.name)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                  }}
                />
                )}
                {!q.isLoading && rows.length === 0 && (
                  <TableEmptyRow
                    colSpan={8}
                    icon={<User className="h-5 w-5" />}
                    title="Nenhum cliente encontrado"
                    description="Tente limpar a busca ou os filtros de período para ver todos os clientes."
                  />
                )}
              </TableBody>
            </Table>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {q.isLoading && <CardGridSkeleton count={6} />}
          {!q.isLoading && rows.map((c: any) => {
            const isPaid = c._paid >= c._total && c._total > 0;
            const isPartial = c._paid > 0 && c._paid < c._total;
            const isPending = c._paid === 0 && c._total > 0;

            return (
              <Card
                key={c.id}
                className="border-border/50 hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => setSelected(c)}
              >
                <CardContent className="p-4 space-y-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                        <User className="h-5 w-5" />
                      </div>
                      <div>
                        <h3 className="font-bold leading-tight">{c.name}</h3>
                        <p className="text-xs text-muted-foreground">
                          {c.company ?? "Empresa não informada"}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteCustomer(c.id, c.name);
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                        <Badge variant="secondary">{c._sales.length} vendas</Badge>
                      </div>
                      {isPaid ? (
                        <Badge className="text-[10px] bg-green-100 text-green-700 border-green-200">
                          PAGO TOTAL
                        </Badge>
                      ) : isPartial ? (
                        <Badge className="text-[10px] bg-orange-100 text-orange-700 border-orange-200">
                          PAGO PARCIAL
                        </Badge>
                      ) : isPending ? (
                        <Badge className="text-[10px] bg-red-100 text-red-700 border-red-200">
                          PENDENTE
                        </Badge>
                      ) : null}
                    </div>
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2">
                      <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-muted-foreground">Doc:</span>
                      <span>{c.document ?? "—"}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="truncate">{c.email ?? "—"}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                      <span>{c.phone ? formatPhoneBR(c.phone) : "—"}</span>
                      {waLink(c.phone) && (
                        <a
                          href={waLink(c.phone)!}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          aria-label={`Enviar WhatsApp para ${c.name}`}
                          className="ml-auto inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-[#25D366] text-white hover:opacity-90"
                        >
                          <MessageCircle className="w-3 h-3" /> WhatsApp
                        </a>
                      )}
                    </div>
                  </div>
                  <div className="pt-3 border-t flex justify-between items-center">
                    <div className="flex flex-col">
                      <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">
                        Total Contratado
                      </span>
                      <span className="font-bold text-primary">{formatCurrency(c._total)}</span>
                    </div>
                    <div className="flex flex-col items-end">
                      <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">
                        Saldo Devedor
                      </span>
                      <span
                        className={`font-bold ${c._total - c._paid > 0 ? "text-red-500" : "text-green-600"}`}
                      >
                        {formatCurrency(c._total - c._paid)}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
          {!q.isLoading && rows.length === 0 && (
            <EmptyState
              className="col-span-full py-16"
              icon={<User className="h-5 w-5" />}
              title="Nenhum cliente encontrado"
              description="Tente limpar a busca ou os filtros de período para ver todos os clientes."
            />
          )}
        </div>
      )}
      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selected?.name}</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm bg-muted/30 p-4 rounded-lg">
                {selected.company && (
                  <div className="flex items-center gap-2 font-medium">
                    <Building2 className="w-4 h-4 text-primary" />
                    {selected.company}
                  </div>
                )}
                {selected.document && (
                  <div className="flex items-center gap-2 font-medium">
                    <FileText className="w-4 h-4 text-primary" />
                    {selected.document}
                  </div>
                )}
                {selected.phone && (
                  <div className="flex items-center gap-2 font-medium">
                    <Phone className="w-4 h-4 text-primary" />
                    <span>{formatPhoneBR(selected.phone)}</span>
                    {waLink(selected.phone) && (
                      <a
                        href={waLink(selected.phone)!}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`Enviar WhatsApp para ${selected.name}`}
                        className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-[#25D366] text-white hover:opacity-90"
                      >
                        <MessageCircle className="w-2.5 h-2.5" /> WhatsApp
                      </a>
                    )}
                  </div>
                )}
                {selected.email && (
                  <div className="flex items-center gap-2 font-medium">
                    <Mail className="w-4 h-4 text-primary" />
                    {selected.email}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="bg-primary/5 border-primary/20">
                  <CardContent className="p-4">
                    <div className="text-xs text-muted-foreground uppercase font-bold tracking-wider">
                      Total de Vendas
                    </div>
                    <div className="text-2xl font-bold text-primary">{selected._sales.length}</div>
                  </CardContent>
                </Card>
                <Card className="bg-green-50/50 border-green-100">
                  <CardContent className="p-4">
                    <div className="text-xs text-muted-foreground uppercase font-bold tracking-wider">
                      Total Contratado
                    </div>
                    <div className="text-2xl font-bold text-green-700">
                      {formatCurrency(selected._total)}
                    </div>
                  </CardContent>
                </Card>
                <Card className="bg-blue-50/50 border-blue-100">
                  <CardContent className="p-4">
                    <div className="text-xs text-muted-foreground uppercase font-bold tracking-wider">
                      Total Pago
                    </div>
                    <div className="text-2xl font-bold text-blue-700">
                      {formatCurrency(selected._paid)}
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="space-y-4">
                <h3 className="font-bold text-lg border-b pb-2 flex items-center gap-2">
                  <LayoutGrid className="w-5 h-5 text-primary" />
                  Histórico Detalhado de Vendas
                </h3>

                <div className="space-y-4">
                  {selected._sales
                    .sort((a: any, b: any) => (b.sale_date ?? "").localeCompare(a.sale_date ?? ""))
                    .map((s: any) => (
                      <Card key={s.id} className="border-border/50 overflow-hidden">
                        <div className="bg-muted/40 px-4 py-2 border-b flex justify-between items-center text-sm">
                          <span className="font-bold flex items-center gap-2">
                            {fmtDate(s.sale_date)}
                            {s.package_id ? (
                              <Badge
                                variant="outline"
                                className="bg-primary/5 text-primary border-primary/20 font-bold uppercase text-[10px]"
                              >
                                PACOTE: {lookup.packages.get(s.package_id) ?? "Não identificado"}
                              </Badge>
                            ) : (
                              <Badge
                                variant="outline"
                                className="bg-slate-100 text-slate-700 border-slate-200 font-bold uppercase text-[10px]"
                              >
                                {lookup.services.get(s.service_type_id) ?? "Serviço Avulso"}
                              </Badge>
                            )}
                          </span>
                          <Badge
                            className={
                              s.payment_status === "pago_total"
                                ? "bg-green-100 text-green-700 border-green-200"
                                : "bg-orange-100 text-orange-700 border-orange-200"
                            }
                          >
                            {s.payment_status === "pago_total"
                              ? "PAGO TOTAL"
                              : "PENDENTE / PARCIAL"}
                          </Badge>
                        </div>
                        <CardContent className="p-4">
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                            <div>
                              <p className="text-[10px] text-muted-foreground uppercase font-bold">
                                Vendedor
                              </p>
                              <p className="text-sm font-medium">
                                {lookup.sellers.get(s.seller_id) ?? "—"}
                              </p>
                            </div>
                            <div>
                              <p className="text-[10px] text-muted-foreground uppercase font-bold">
                                Produtor
                              </p>
                              <p className="text-sm font-medium">
                                {lookup.producers.get(s.producer_id) ?? "—"}
                              </p>
                            </div>
                            <div>
                              <p className="text-[10px] text-muted-foreground uppercase font-bold">
                                Valor Total
                              </p>
                              <p className="text-sm font-bold text-primary">
                                {formatCurrency(s.total_amount)}
                              </p>
                            </div>
                            <div>
                              <p className="text-[10px] text-muted-foreground uppercase font-bold">
                                Pago
                              </p>
                              <p className="text-sm font-bold text-green-600">
                                {formatCurrency(s.paid_amount)}
                              </p>
                            </div>
                            <div>
                              <p className="text-[10px] text-muted-foreground uppercase font-bold">
                                Pagamento
                              </p>
                              <p className="text-sm font-medium">
                                {s.payment_method === "pix"
                                  ? "PIX"
                                  : s.payment_method === "credit_card"
                                    ? "Cartão"
                                    : s.payment_method === "bank_transfer"
                                      ? "Transf."
                                      : s.payment_method === "cash"
                                        ? "Dinheiro"
                                        : s.payment_method === "link"
                                          ? "Link"
                                          : "—"}
                              </p>
                            </div>
                          </div>

                          {s.notes && (
                            <div className="mb-4 p-3 bg-amber-50/30 border border-amber-100 rounded-md text-sm italic">
                              <p className="text-[10px] text-amber-700 uppercase font-bold mb-1 not-italic">
                                Observações da Venda:
                              </p>
                              "{s.notes}"
                            </div>
                          )}

                          <div className="flex flex-wrap gap-2 pt-2 border-t mt-2">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 gap-1.5"
                              onClick={() => openReceipts(s)}
                            >
                              <Paperclip className="w-3.5 h-3.5" />
                              Ver Comprovantes
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  {selected._sales.length === 0 && (
                    <div className="text-center py-10 text-muted-foreground italic border-2 border-dashed rounded-lg">
                      Nenhuma venda registrada para este cliente.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!receiptsSale} onOpenChange={(o) => !o && setReceiptsSale(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Comprovantes da venda</DialogTitle>
          </DialogHeader>
          {loadingReceipts ? (
            <div className="py-8 text-center">
              <Loader2 className="w-5 h-5 animate-spin inline" />
            </div>
          ) : receipts.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">
              Nenhum comprovante anexado.
            </div>
          ) : (
            <div className="space-y-2">
              {receipts.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center justify-between border rounded-md px-3 py-2"
                >
                  <div className="text-sm">
                    <div className="font-medium">
                      {fmtDate(r.paid_at)} — {formatCurrency(r.amount)}
                    </div>
                    {r.notes && <div className="text-xs text-muted-foreground">{r.notes}</div>}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      const { data } = await supabase.storage
                        .from("receipts")
                        .createSignedUrl(r.file_path, 3600);
                      if (data?.signedUrl) window.open(data.signedUrl, "_blank");
                      else toast.error("Não foi possível gerar o link do comprovante");
                    }}
                  >
                    <Paperclip className="w-3.5 h-3.5 mr-1" /> Abrir
                  </Button>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
