import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2, CreditCard, CheckCircle2, XCircle, Clock, Search, Filter, Calendar as CalendarIcon, User, DollarSign, ArrowUpRight } from "lucide-react";
import { formatCurrency } from "@/lib/auth";
import { fmtDate } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { addDays, format, isWithinInterval, startOfDay, endOfDay } from "date-fns";
import { DateRange } from "react-day-picker";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/pagarme-history")({
  component: PagarmeHistoryPage,
});

function PagarmeHistoryPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sellerFilter, setSellerFilter] = useState("all");
  const [date, setDate] = useState<DateRange | undefined>({
    from: addDays(new Date(), -30),
    to: new Date(),
  });

  // Escutar atualizações de webhooks em tempo real
  useEffect(() => {
    const channel = supabase
      .channel("pagarme_webhooks_changes")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "pagarme_webhooks" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["pagarme-webhooks-history"] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const { data: sellers } = useQuery({
    queryKey: ["sellers-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sellers")
        .select("id, name")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: webhooks, isLoading } = useQuery({
    queryKey: ["pagarme-webhooks-history"],
    queryFn: async () => {
      // Buscamos os webhooks e tentamos relacionar com as vendas
      // Como não há FK direta, pegamos os dados e relacionaremos no useMemo para maior flexibilidade
      const { data: webhooksData, error: webhooksError } = await supabase
        .from("pagarme_webhooks")
        .select("*")
        .order("created_at", { ascending: false });
      
      if (webhooksError) throw webhooksError;

      // Pegamos também as vendas que têm pagarme_id para o join manual
      const { data: salesData, error: salesError } = await supabase
        .from("sales")
        .select("pagarme_id, total_amount, seller_id, sellers(name)")
        .not("pagarme_id", "is", null);

      if (salesError) throw salesError;

      // Mapear vendas por pagarme_id para busca rápida
      const salesMap = new Map();
      salesData.forEach(sale => {
        if (sale.pagarme_id) {
          salesMap.set(sale.pagarme_id, sale);
        }
      });

      return (webhooksData ?? []).map(webhook => {
        const payload = (webhook.payload as any) || {};
        const data = payload.data || {};
        
        // Tenta encontrar a venda pelo ID da ordem ou pelo payment_link_id
        const sale = salesMap.get(webhook.pagarme_id) || salesMap.get(data.payment_link_id);
        
        return {
          ...webhook,
          sale_info: sale || null
        };
      });
    },
  });

  const filteredData = useMemo(() => {
    if (!webhooks) return [];

    return webhooks.filter((item: any) => {
      // Filtro de Texto (ID ou Nome do Vendedor)
      if (search) {
        const searchLower = search.toLowerCase();
        const matchesId = item.pagarme_id?.toLowerCase().includes(searchLower);
        const matchesSeller = item.sale_info?.sellers?.name?.toLowerCase().includes(searchLower);
        if (!matchesId && !matchesSeller) return false;
      }

      // Filtro de Status
      if (statusFilter !== "all" && item.event_type !== statusFilter) return false;

      // Filtro de Vendedor
      if (sellerFilter !== "all" && item.sale_info?.seller_id !== sellerFilter) return false;

      // Filtro de Data
      if (date?.from || date?.to) {
        const createdAt = new Date(item.created_at);
        if (date.from && createdAt < startOfDay(date.from)) return false;
        if (date.to && createdAt > endOfDay(date.to)) return false;
      }

      return true;
    });
  }, [webhooks, search, statusFilter, sellerFilter, date]);

  const totals = useMemo(() => {
    return filteredData.reduce((acc: any, curr: any) => {
      const payload = (curr.payload as any) || {};
      const data = payload.data || {};
      const amount = data.amount ? data.amount / 100 : 0;

      if (curr.event_type === "order.paid") {
        acc.paid += amount;
        acc.count_paid += 1;
      } else if (curr.event_type === "order.canceled") {
        acc.canceled += amount;
        acc.count_canceled += 1;
      } else {
        acc.pending += amount;
        acc.count_pending += 1;
      }
      return acc;
    }, { paid: 0, canceled: 0, pending: 0, count_paid: 0, count_canceled: 0, count_pending: 0 });
  }, [filteredData]);

  const getStatusBadge = (eventType: string) => {
    switch (eventType) {
      case "order.paid":
        return <Badge className="bg-green-500 hover:bg-green-600"><CheckCircle2 className="w-3 h-3 mr-1" /> Pago</Badge>;
      case "order.canceled":
        return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" /> Cancelado</Badge>;
      case "order.created":
        return <Badge variant="outline" className="text-blue-500 border-blue-200 bg-blue-50"><Clock className="w-3 h-3 mr-1" /> Criado</Badge>;
      case "order.payment_failed":
        return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" /> Falhou</Badge>;
      default:
        return <Badge variant="secondary">{eventType}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Histórico Pagar.me</h1>
          <p className="text-muted-foreground">Acompanhe confirmações de pagamento via cartão/PIX</p>
        </div>
        <div className="bg-emerald-100 p-2 rounded-lg border border-emerald-200 w-fit">
          <CreditCard className="w-6 h-6 text-emerald-600" />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-emerald-50 border-emerald-100">
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-xs font-medium text-emerald-600 uppercase tracking-wider flex items-center justify-between">
              Total Aprovado
              <ArrowUpRight className="w-4 h-4" />
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <div className="text-2xl font-bold text-emerald-700">{formatCurrency(totals.paid)}</div>
            <p className="text-[10px] text-emerald-600 mt-1">{totals.count_paid} transações pagas</p>
          </CardContent>
        </Card>

        <Card className="bg-amber-50 border-amber-100">
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-xs font-medium text-amber-600 uppercase tracking-wider flex items-center justify-between">
              Total Pendente/Criado
              <Clock className="w-4 h-4" />
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <div className="text-2xl font-bold text-amber-700">{formatCurrency(totals.pending)}</div>
            <p className="text-[10px] text-amber-600 mt-1">{totals.count_pending} transações pendentes</p>
          </CardContent>
        </Card>

        <Card className="bg-red-50 border-red-100">
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-xs font-medium text-red-600 uppercase tracking-wider flex items-center justify-between">
              Total Cancelado
              <XCircle className="w-4 h-4" />
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <div className="text-2xl font-bold text-red-700">{formatCurrency(totals.canceled)}</div>
            <p className="text-[10px] text-red-600 mt-1">{totals.count_canceled} transações canceladas</p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/50">
        <CardHeader className="pb-3 border-b">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <Filter className="w-5 h-5 text-emerald-600" />
              Filtros e Busca
            </CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="ID ou Nome do Vendedor..."
                  className="pl-9"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "justify-start text-left font-normal w-full sm:w-[240px]",
                      !date && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {date?.from ? (
                      date.to ? (
                        <>
                          {format(date.from, "dd/MM/yy")} - {format(date.to, "dd/MM/yy")}
                        </>
                      ) : (
                        format(date.from, "dd/MM/yy")
                      )
                    ) : (
                      <span>Filtrar por data</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="end">
                  <Calendar
                    initialFocus
                    mode="range"
                    defaultMonth={date?.from}
                    selected={date}
                    onSelect={setDate}
                    numberOfMonths={2}
                  />
                </PopoverContent>
              </Popover>

              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-[160px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos Status</SelectItem>
                  <SelectItem value="order.paid">Pago</SelectItem>
                  <SelectItem value="order.created">Criado/Pendente</SelectItem>
                  <SelectItem value="order.canceled">Cancelado</SelectItem>
                  <SelectItem value="order.payment_failed">Falhou</SelectItem>
                </SelectContent>
              </Select>

              <Select value={sellerFilter} onValueChange={setSellerFilter}>
                <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue placeholder="Vendedor" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos Vendedores</SelectItem>
                  {sellers?.map((seller) => (
                    <SelectItem key={seller.id} value={seller.id}>
                      {seller.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {(search || statusFilter !== "all" || sellerFilter !== "all" || date) && (
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => {
                    setSearch("");
                    setStatusFilter("all");
                    setSellerFilter("all");
                    setDate(undefined);
                  }}
                  className="text-xs text-muted-foreground hover:text-primary"
                >
                  Limpar
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-6">Data/Hora</TableHead>
                <TableHead>Vendedor</TableHead>
                <TableHead>ID Pagar.me</TableHead>
                <TableHead>Evento</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead className="pr-6">Método</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-10">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto text-emerald-600" />
                    <span className="text-sm text-muted-foreground mt-2 block">Carregando histórico...</span>
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && filteredData.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-10 text-muted-foreground">
                    Nenhum pagamento encontrado com os filtros selecionados.
                  </TableCell>
                </TableRow>
              )}
              {filteredData.map((webhook: any) => {
                const payload = (webhook.payload as any) || {};
                const data = payload.data || {};
                const amount = data.amount ? data.amount / 100 : 0;
                const method = data.charges?.[0]?.payment_method || "—";
                const sellerName = webhook.sale_info?.sellers?.name || "—";
                
                return (
                  <TableRow key={webhook.id} className="group hover:bg-muted/50 transition-colors">
                    <TableCell className="whitespace-nowrap pl-6 font-medium">{fmtDate(webhook.created_at)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <User className="w-3 h-3 text-muted-foreground" />
                        <span className="text-sm font-medium">{sellerName}</span>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-[10px] text-muted-foreground">{webhook.pagarme_id || "—"}</TableCell>
                    <TableCell className="capitalize text-xs">{webhook.event_type?.replace(/\./g, ' ')}</TableCell>
                    <TableCell>{getStatusBadge(webhook.event_type)}</TableCell>
                    <TableCell className="text-right font-bold text-emerald-700">
                      {amount > 0 ? formatCurrency(amount) : "—"}
                    </TableCell>
                    <TableCell className="uppercase text-[10px] font-bold text-muted-foreground pr-6">{method}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
