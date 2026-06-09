import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import {
  TrendingUp, TrendingDown, DollarSign, Wallet, AlertTriangle, CheckCircle2,
  Clock, Plus, Download, Trash2, Upload, ArrowUpRight, ArrowDownRight, Target,
  PieChart as PieIcon, BarChart3, Activity, CreditCard,
} from "lucide-react";
import {
  ResponsiveContainer, LineChart, Line, AreaChart, Area, BarChart, Bar,
  PieChart, Pie, Cell, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from "recharts";
import { formatCurrency } from "@/lib/auth";
import { fmtDate } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/finance")({
  component: FinancePage,
});

type PeriodKey = "today" | "week" | "month" | "year" | "custom";

const CAT_LABEL: Record<string, string> = {
  trafego_pago: "Tráfego pago",
  impostos: "Impostos",
  nota_fiscal: "Nota fiscal",
  aluguel: "Aluguel",
  agua: "Água",
  luz: "Luz",
  internet: "Internet",
  limpeza: "Limpeza",
  folha_pagamento: "Folha de pagamento",
  comissoes: "Comissões",
  ferramentas: "Ferramentas",
  producao: "Produção",
  outras: "Outras despesas",
};

const CAT_COLORS = [
  "#ef4444", "#f97316", "#eab308", "#22c55e", "#10b981", "#06b6d4",
  "#3b82f6", "#6366f1", "#8b5cf6", "#a855f7", "#ec4899", "#f43f5e", "#64748b",
];

function rangeFor(period: PeriodKey, from: string, to: string) {
  const today = new Date();
  const y = today.getFullYear();
  const m = today.getMonth();
  const d = today.getDate();
  const iso = (dt: Date) => dt.toISOString().slice(0, 10);
  if (period === "today") return { from: iso(new Date(y, m, d)), to: iso(new Date(y, m, d)) };
  if (period === "week") {
    const start = new Date(y, m, d - today.getDay());
    return { from: iso(start), to: iso(today) };
  }
  if (period === "month") return { from: iso(new Date(y, m, 1)), to: iso(new Date(y, m + 1, 0)) };
  if (period === "year") return { from: iso(new Date(y, 0, 1)), to: iso(new Date(y, 11, 31)) };
  return { from, to };
}

function FinancePage() {
  const qc = useQueryClient();
  const [period, setPeriod] = useState<PeriodKey>("month");
  const todayIso = new Date().toISOString().slice(0, 10);
  const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
  const [from, setFrom] = useState(firstOfMonth);
  const [to, setTo] = useState(todayIso);
  const range = useMemo(() => rangeFor(period, from, to), [period, from, to]);

  // ---------- Queries ----------
  const sales = useQuery({
    queryKey: ["fin-sales"],
    queryFn: async () =>
      (await supabase.from("sales").select("id,customer_id,seller_id,producer_id,service_type_id,total_amount,paid_amount,payment_status,payment_method,sale_date,created_at")).data ?? [],
  });
  const expenses = useQuery({
    queryKey: ["fin-expenses"],
    queryFn: async () =>
      (await supabase.from("expenses").select("*").order("due_date", { ascending: false })).data ?? [],
  });
  const cashMoves = useQuery({
    queryKey: ["fin-cash"],
    queryFn: async () =>
      (await supabase.from("cash_movements").select("*").order("movement_date", { ascending: false })).data ?? [],
  });
  const customers = useQuery({
    queryKey: ["fin-customers"],
    queryFn: async () => (await supabase.from("customers").select("id,name")).data ?? [],
  });
  const sellers = useQuery({
    queryKey: ["fin-sellers"],
    queryFn: async () => (await supabase.from("sellers").select("id,name,commission_rate,monthly_goal")).data ?? [],
  });
  const producers = useQuery({
    queryKey: ["fin-producers"],
    queryFn: async () => (await supabase.from("producers").select("id,name")).data ?? [],
  });
  const serviceTypes = useQuery({
    queryKey: ["fin-stypes"],
    queryFn: async () => (await supabase.from("service_types").select("id,name")).data ?? [],
  });
  const goals = useQuery({
    queryKey: ["fin-goals"],
    queryFn: async () => (await supabase.from("goals").select("*").is("seller_id", null)).data ?? [],
  });

  // ---------- Lookups ----------
  const lookup = useMemo(() => ({
    customers: new Map((customers.data ?? []).map((c: any) => [c.id, c.name])),
    sellers: new Map((sellers.data ?? []).map((s: any) => [s.id, s.name])),
    producers: new Map((producers.data ?? []).map((p: any) => [p.id, p.name])),
    serviceTypes: new Map((serviceTypes.data ?? []).map((s: any) => [s.id, s.name])),
  }), [customers.data, sellers.data, producers.data, serviceTypes.data]);

  // ---------- Filtering ----------
  const inRange = (d?: string | null) => !!d && d >= range.from && d <= range.to;

  const salesAll = sales.data ?? [];
  const salesInRange = salesAll.filter((s: any) => inRange(s.sale_date));
  const expensesAll = expenses.data ?? [];
  const expensesInRange = expensesAll.filter((e: any) => inRange(e.paid_date ?? e.due_date));

  // ---------- KPIs ----------
  const todayStr = todayIso;
  const weekStart = (() => { const d = new Date(); d.setDate(d.getDate() - d.getDay()); return d.toISOString().slice(0,10); })();
  const monthStart = firstOfMonth;
  const yearStart = `${new Date().getFullYear()}-01-01`;

  const totalSale = (arr: any[]) => arr.reduce((a, s) => a + Number(s.total_amount ?? 0), 0);
  const totalPaid = (arr: any[]) => arr.reduce((a, s) => a + Number(s.paid_amount ?? 0), 0);

  const k = {
    dia: totalSale(salesAll.filter((s: any) => s.sale_date === todayStr)),
    semana: totalSale(salesAll.filter((s: any) => s.sale_date >= weekStart)),
    mes: totalSale(salesAll.filter((s: any) => s.sale_date >= monthStart)),
    ano: totalSale(salesAll.filter((s: any) => s.sale_date >= yearStart)),
    recebido: totalPaid(salesAll),
    aReceber: salesAll.reduce((a: number, s: any) => a + (Number(s.total_amount) - Number(s.paid_amount)), 0),
    atraso: salesAll.filter((s: any) => s.payment_status !== "pago_total" && s.sale_date < todayStr)
      .reduce((a: number, s: any) => a + (Number(s.total_amount) - Number(s.paid_amount)), 0),
    despDia: expensesAll.filter((e: any) => (e.paid_date ?? e.due_date) === todayStr).reduce((a: number, e: any) => a + Number(e.amount), 0),
    despMes: expensesAll.filter((e: any) => (e.paid_date ?? e.due_date) >= monthStart).reduce((a: number, e: any) => a + Number(e.amount), 0),
  };

  const totalRecebidoMes = totalPaid(salesAll.filter((s: any) => s.sale_date >= monthStart && s.payment_method !== "cartao"));
  const lucroBruto = totalRecebidoMes;
  const despesasPagasMes = expensesAll.filter((e: any) => e.status === "pago" && e.paid_date && e.paid_date >= monthStart)
    .reduce((a: number, e: any) => a + Number(e.amount), 0);
  const lucroLiquido = lucroBruto - despesasPagasMes;

  // caixa: total recebido + entradas manuais - despesas pagas - saídas manuais
  const moves = cashMoves.data ?? [];
  const entradasManuais = moves.filter((m: any) => m.movement_type === "entrada").reduce((a: number, m: any) => a + Number(m.amount), 0);
  const saidasManuais = moves.filter((m: any) => m.movement_type === "saida").reduce((a: number, m: any) => a + Number(m.amount), 0);
  const totalDespesasPagas = expensesAll.filter((e: any) => e.status === "pago").reduce((a: number, e: any) => a + Number(e.amount), 0);
  const saldoCaixa = totalPaid(salesAll.filter((s: any) => s.payment_method !== "cartao")) + entradasManuais - totalDespesasPagas - saidasManuais;

  const metaMensal = Number((goals.data ?? []).find((g: any) => g.period === "monthly")?.target_amount ?? 0);
  const metaPct = metaMensal > 0 ? Math.min(100, (k.mes / metaMensal) * 100) : 0;

  const noLucro = lucroLiquido >= 0;

  // ---------- Charts ----------
  const monthChart = useMemo(() => {
    const months: any[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i);
      const key = d.toISOString().slice(0, 7);
      const label = d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });
      const fat = totalSale(salesAll.filter((s: any) => (s.sale_date ?? "").startsWith(key)));
      const desp = expensesAll.filter((e: any) => (e.paid_date ?? e.due_date ?? "").startsWith(key)).reduce((a: number, e: any) => a + Number(e.amount), 0);
      months.push({ mes: label, Faturamento: fat, Despesas: desp, Lucro: fat - desp });
    }
    return months;
  }, [salesAll, expensesAll]);

  const expensesByCategory = useMemo(() => {
    const map = new Map<string, number>();
    expensesInRange.forEach((e: any) => map.set(e.category, (map.get(e.category) ?? 0) + Number(e.amount)));
    return Array.from(map.entries()).map(([category, value], i) => ({
      name: CAT_LABEL[category] ?? category,
      value,
      fill: CAT_COLORS[i % CAT_COLORS.length],
    }));
  }, [expensesInRange]);

  const salesBySeller = useMemo(() => {
    return (sellers.data ?? []).map((s: any) => {
      const list = salesInRange.filter((x: any) => x.seller_id === s.id);
      return {
        name: s.name,
        Vendido: totalSale(list),
        Pago: totalPaid(list),
        Vendas: list.length,
        Comissao: (totalPaid(list) * Number(s.commission_rate ?? 0)) / 100,
      };
    }).sort((a, b) => b.Vendido - a.Vendido);
  }, [sellers.data, salesInRange]);

  const prodByProducer = useMemo(() => {
    return (producers.data ?? []).map((p: any) => {
      const list = salesInRange.filter((x: any) => x.producer_id === p.id);
      return { name: p.name, Quantidade: list.length, Valor: totalSale(list) };
    }).sort((a, b) => b.Valor - a.Valor);
  }, [producers.data, salesInRange]);

  const cashEvolution = useMemo(() => {
    // running balance per month
    const data: any[] = [];
    let acc = 0;
    for (let i = 11; i >= 0; i--) {
      const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i);
      const key = d.toISOString().slice(0, 7);
      const ent = totalPaid(salesAll.filter((s: any) => (s.sale_date ?? "").startsWith(key) && s.payment_method !== "cartao"))
        + moves.filter((m: any) => m.movement_type === "entrada" && m.movement_date.startsWith(key)).reduce((a: number, m: any) => a + Number(m.amount), 0);
      const sai = expensesAll.filter((e: any) => e.status === "pago" && (e.paid_date ?? "").startsWith(key)).reduce((a: number, e: any) => a + Number(e.amount), 0)
        + moves.filter((m: any) => m.movement_type === "saida" && m.movement_date.startsWith(key)).reduce((a: number, m: any) => a + Number(m.amount), 0);
      acc += ent - sai;
      data.push({ mes: d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }), Saldo: acc });
    }
    return data;
  }, [salesAll, expensesAll, moves]);

  const topServices = useMemo(() => {
    const map = new Map<string, { qtd: number; valor: number }>();
    salesInRange.forEach((s: any) => {
      const k2 = s.service_type_id ?? "—";
      const cur = map.get(k2) ?? { qtd: 0, valor: 0 };
      cur.qtd += 1; cur.valor += Number(s.total_amount ?? 0);
      map.set(k2, cur);
    });
    return Array.from(map.entries()).map(([id, v]) => ({
      name: lookup.serviceTypes.get(id) ?? "—", ...v,
    })).sort((a, b) => b.valor - a.valor).slice(0, 5);
  }, [salesInRange, lookup.serviceTypes]);

  const topCustomers = useMemo(() => {
    const map = new Map<string, { qtd: number; valor: number }>();
    salesInRange.forEach((s: any) => {
      const k2 = s.customer_id ?? "—";
      const cur = map.get(k2) ?? { qtd: 0, valor: 0 };
      cur.qtd += 1; cur.valor += Number(s.total_amount ?? 0);
      map.set(k2, cur);
    });
    return Array.from(map.entries()).map(([id, v]) => ({
      name: lookup.customers.get(id) ?? "—", ...v,
    })).sort((a, b) => b.valor - a.valor).slice(0, 5);
  }, [salesInRange, lookup.customers]);

  // ---------- Expense form ----------
  const [openExp, setOpenExp] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState<any>({
    name: "", category: "outras", amount: "", due_date: todayStr,
    paid_date: "", status: "pendente", supplier: "", notes: "", receipt_url: "",
  });
  const [receiptFile, setReceiptFile] = useState<File | null>(null);

  const openNew = () => {
    setEditing(null);
    setForm({ name: "", category: "outras", amount: "", due_date: todayStr, paid_date: "", status: "pendente", supplier: "", notes: "", receipt_url: "" });
    setReceiptFile(null);
    setOpenExp(true);
  };
  const openEdit = (e: any) => {
    setEditing(e);
    setForm({
      name: e.name, category: e.category, amount: String(e.amount),
      due_date: e.due_date ?? "", paid_date: e.paid_date ?? "",
      status: e.status, supplier: e.supplier ?? "", notes: e.notes ?? "",
      receipt_url: e.receipt_url ?? "",
    });
    setReceiptFile(null);
    setOpenExp(true);
  };

  const saveExpense = async () => {
    if (!form.name || !form.amount) { toast.error("Preencha nome e valor"); return; }
    let receipt_url = form.receipt_url;
    if (receiptFile) {
      const path = `${Date.now()}-${receiptFile.name}`;
      const { error: upErr } = await supabase.storage.from("expense-receipts").upload(path, receiptFile);
      if (upErr) { toast.error(upErr.message); return; }
      receipt_url = path;
    }
    const payload = {
      name: form.name,
      category: form.category,
      amount: Number(form.amount),
      due_date: form.due_date || null,
      paid_date: form.paid_date || null,
      status: form.status,
      supplier: form.supplier || null,
      notes: form.notes || null,
      receipt_url: receipt_url || null,
    };
    const { error } = editing
      ? await supabase.from("expenses").update(payload).eq("id", editing.id)
      : await supabase.from("expenses").insert(payload);
    if (error) { toast.error(error.message); return; }
    toast.success(editing ? "Despesa atualizada" : "Despesa criada");
    setOpenExp(false);
    qc.invalidateQueries({ queryKey: ["fin-expenses"] });
  };

  const deleteExpense = async (id: string) => {
    if (!confirm("Excluir despesa?")) return;
    const { error } = await supabase.from("expenses").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Despesa excluída");
    qc.invalidateQueries({ queryKey: ["fin-expenses"] });
  };

  const markAsPaid = async (id: string) => {
    const { error } = await supabase.from("expenses").update({ status: "pago", paid_date: todayStr }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["fin-expenses"] });
  };

  const getReceiptUrl = async (path: string) => {
    const { data } = await supabase.storage.from("expense-receipts").createSignedUrl(path, 60);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  };

  // ---------- Cash movement form ----------
  const [openMove, setOpenMove] = useState(false);
  const [moveForm, setMoveForm] = useState<any>({ movement_type: "entrada", amount: "", description: "", category: "", movement_date: todayStr });
  const saveMovement = async () => {
    if (!moveForm.amount) { toast.error("Informe o valor"); return; }
    const { error } = await supabase.from("cash_movements").insert({
      movement_type: moveForm.movement_type,
      amount: Number(moveForm.amount),
      description: moveForm.description || null,
      category: moveForm.category || null,
      movement_date: moveForm.movement_date,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Movimento registrado");
    setOpenMove(false);
    setMoveForm({ movement_type: "entrada", amount: "", description: "", category: "", movement_date: todayStr });
    qc.invalidateQueries({ queryKey: ["fin-cash"] });
  };

  // ---------- Filters (entradas) ----------
  const [fSeller, setFSeller] = useState<string>("all");
  const [fProducer, setFProducer] = useState<string>("all");
  const [fCustomer, setFCustomer] = useState<string>("all");
  const [fStype, setFStype] = useState<string>("all");
  const [fMethod, setFMethod] = useState<string>("all");
  const [fStatus, setFStatus] = useState<string>("all");

  const incomesFiltered = useMemo(() => salesInRange.filter((s: any) =>
    (fSeller === "all" || s.seller_id === fSeller) &&
    (fProducer === "all" || s.producer_id === fProducer) &&
    (fCustomer === "all" || s.customer_id === fCustomer) &&
    (fStype === "all" || s.service_type_id === fStype) &&
    (fMethod === "all" || s.payment_method === fMethod) &&
    (fStatus === "all" || s.payment_status === fStatus)
  ), [salesInRange, fSeller, fProducer, fCustomer, fStype, fMethod, fStatus]);

  // ---------- Totals by payment method ----------
  const METHOD_LABEL: Record<string, string> = {
    pix: "PIX", cartao: "Cartão", boleto: "Boleto",
    dinheiro: "Dinheiro", transferencia: "Transferência", outros: "Outros",
  };
  const byMethod = useMemo(() => {
    const map = new Map<string, { total: number; pago: number; qtd: number }>();
    incomesFiltered.forEach((s: any) => {
      const key = s.payment_method ?? "outros";
      const cur = map.get(key) ?? { total: 0, pago: 0, qtd: 0 };
      cur.total += Number(s.total_amount ?? 0);
      cur.pago += Number(s.paid_amount ?? 0);
      cur.qtd += 1;
      map.set(key, cur);
    });
    return Array.from(map.entries())
      .map(([m, v]) => ({ method: m, label: METHOD_LABEL[m] ?? m, ...v }))
      .sort((a, b) => b.pago - a.pago);
  }, [incomesFiltered]);

  // ---------- Export ----------
  const downloadCsv = (filename: string, rows: any[][]) => {
    const csv = rows.map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(";")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  };

  const exportIncomes = () => {
    downloadCsv(`entradas-${range.from}_${range.to}.csv`, [
      ["Data","Cliente","Vendedor","Produtor","Serviço","Forma","Status","Total","Pago","Restante"],
      ...incomesFiltered.map((s: any) => [
        fmtDate(s.sale_date), lookup.customers.get(s.customer_id) ?? "—",
        lookup.sellers.get(s.seller_id) ?? "—", lookup.producers.get(s.producer_id) ?? "—",
        lookup.serviceTypes.get(s.service_type_id) ?? "—",
        s.payment_method ?? "—", s.payment_status,
        Number(s.total_amount).toFixed(2), Number(s.paid_amount).toFixed(2),
        (Number(s.total_amount) - Number(s.paid_amount)).toFixed(2),
      ]),
    ]);
  };
  const exportExpenses = () => {
    downloadCsv(`despesas-${range.from}_${range.to}.csv`, [
      ["Nome","Categoria","Valor","Vencimento","Pagamento","Status","Fornecedor","Observação"],
      ...expensesInRange.map((e: any) => [
        e.name, CAT_LABEL[e.category] ?? e.category, Number(e.amount).toFixed(2),
        fmtDate(e.due_date), fmtDate(e.paid_date), e.status, e.supplier ?? "", e.notes ?? "",
      ]),
    ]);
  };
  const exportPdf = () => {
    const methodRows = byMethod
      .map((v) => `<tr><td>${v.label}</td><td>${v.qtd}</td><td>${formatCurrency(v.total)}</td><td>${formatCurrency(v.pago)}</td><td>${formatCurrency(v.total - v.pago)}</td></tr>`)
      .join("");
    const html = `
      <html><head><meta charset="utf-8"><title>Relatório financeiro</title>
      <style>body{font-family:sans-serif;padding:24px;color:#111}h1{color:#dc2626}table{width:100%;border-collapse:collapse;margin:12px 0}th,td{border:1px solid #ddd;padding:6px;font-size:12px;text-align:left}th{background:#f3f4f6}.kpi{display:inline-block;margin:6px 12px 6px 0;padding:10px 14px;border:1px solid #e5e7eb;border-radius:8px}</style>
      </head><body>
      <h1>Relatório Financeiro</h1>
      <p>Período: ${range.from} → ${range.to}</p>
      <div>
        <div class="kpi"><b>Faturamento mês:</b> ${formatCurrency(k.mes)}</div>
        <div class="kpi"><b>Recebido:</b> ${formatCurrency(k.recebido)}</div>
        <div class="kpi"><b>A receber:</b> ${formatCurrency(k.aReceber)}</div>
        <div class="kpi"><b>Despesas mês:</b> ${formatCurrency(k.despMes)}</div>
        <div class="kpi"><b>Lucro líquido:</b> ${formatCurrency(lucroLiquido)}</div>
        <div class="kpi"><b>Saldo caixa:</b> ${formatCurrency(saldoCaixa)}</div>
      </div>
      <h2>Recebimentos por forma de pagamento</h2>
      <table><thead><tr><th>Forma</th><th>Vendas</th><th>Total</th><th>Pago</th><th>A receber</th></tr></thead><tbody>
        ${methodRows || `<tr><td colspan="5" style="text-align:center;color:#666">Sem dados no período.</td></tr>`}
      </tbody></table>
      <h2>Entradas no período</h2>
      <table><thead><tr><th>Data</th><th>Cliente</th><th>Vendedor</th><th>Total</th><th>Pago</th><th>Status</th></tr></thead><tbody>
        ${incomesFiltered.map((s: any) => `<tr><td>${fmtDate(s.sale_date)}</td><td>${lookup.customers.get(s.customer_id) ?? "—"}</td><td>${lookup.sellers.get(s.seller_id) ?? "—"}</td><td>${formatCurrency(Number(s.total_amount))}</td><td>${formatCurrency(Number(s.paid_amount))}</td><td>${s.payment_status}</td></tr>`).join("")}
      </tbody></table>
      <h2>Despesas no período</h2>
      <table><thead><tr><th>Nome</th><th>Categoria</th><th>Valor</th><th>Vencimento</th><th>Status</th></tr></thead><tbody>
        ${expensesInRange.map((e: any) => `<tr><td>${e.name}</td><td>${CAT_LABEL[e.category] ?? e.category}</td><td>${formatCurrency(Number(e.amount))}</td><td>${fmtDate(e.due_date)}</td><td>${e.status}</td></tr>`).join("")}
      </tbody></table>
      <script>window.print()</script></body></html>`;
    const w = window.open("", "_blank"); if (!w) return;
    w.document.write(html); w.document.close();
  };

  // ---------- Render ----------
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Financeiro</h1>
          <p className="text-muted-foreground">Dashboard, entradas, despesas, caixa e relatórios</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge
            className={noLucro ? "bg-emerald-500/15 text-emerald-500 border-emerald-500/30" : "bg-red-500/15 text-red-500 border-red-500/30"}
          >
            {noLucro ? <TrendingUp className="w-3 h-3 mr-1" /> : <TrendingDown className="w-3 h-3 mr-1" />}
            {noLucro ? "No lucro" : "No vermelho"}
          </Badge>
        </div>
      </div>

      {/* Period filter */}
      <Card className="border-border/50" style={{ boxShadow: "var(--shadow-card)" }}>
        <CardContent className="p-4 flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Período</Label>
            <Select value={period} onValueChange={(v) => setPeriod(v as PeriodKey)}>
              <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="today">Hoje</SelectItem>
                <SelectItem value="week">Semana</SelectItem>
                <SelectItem value="month">Mês atual</SelectItem>
                <SelectItem value="year">Ano atual</SelectItem>
                <SelectItem value="custom">Personalizado</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {period === "custom" && (
            <>
              <div className="space-y-1"><Label className="text-xs">De</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
              <div className="space-y-1"><Label className="text-xs">Até</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
            </>
          )}
          <Badge variant="secondary" className="ml-auto">{range.from} → {range.to}</Badge>
        </CardContent>
      </Card>

      <Tabs defaultValue="dashboard" className="space-y-4">
        <TabsList className="flex flex-wrap">
          <TabsTrigger value="dashboard"><Activity className="w-4 h-4 mr-2" />Dashboard</TabsTrigger>
          <TabsTrigger value="incomes"><ArrowDownRight className="w-4 h-4 mr-2" />Entradas</TabsTrigger>
          <TabsTrigger value="expenses"><ArrowUpRight className="w-4 h-4 mr-2" />Despesas</TabsTrigger>
          <TabsTrigger value="cash"><Wallet className="w-4 h-4 mr-2" />Caixa</TabsTrigger>
          <TabsTrigger value="sales"><BarChart3 className="w-4 h-4 mr-2" />Vendas</TabsTrigger>
          <TabsTrigger value="prod"><Target className="w-4 h-4 mr-2" />Produção</TabsTrigger>
          <TabsTrigger value="pagarme"><CreditCard className="w-4 h-4 mr-2" />Pagar.me</TabsTrigger>
          <TabsTrigger value="reports"><Download className="w-4 h-4 mr-2" />Relatórios</TabsTrigger>
        </TabsList>

        {/* DASHBOARD */}
        <TabsContent value="dashboard" className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <Kpi color="blue" icon={DollarSign} label="Hoje" value={k.dia} />
            <Kpi color="blue" icon={DollarSign} label="Semana" value={k.semana} />
            <Kpi color="blue" icon={DollarSign} label="Mês" value={k.mes} />
            <Kpi color="blue" icon={DollarSign} label="Ano" value={k.ano} />
            <Kpi color="green" icon={CheckCircle2} label="Recebido" value={k.recebido} />
            <Kpi color="yellow" icon={Clock} label="A receber" value={k.aReceber} />
            <Kpi color="red" icon={AlertTriangle} label="Em atraso" value={k.atraso} />
            <Kpi color="red" icon={ArrowUpRight} label="Despesas hoje" value={k.despDia} />
            <Kpi color="red" icon={ArrowUpRight} label="Despesas mês" value={k.despMes} />
            <Kpi color={lucroBruto >= 0 ? "green" : "red"} icon={TrendingUp} label="Lucro bruto" value={lucroBruto} />
            <Kpi color={lucroLiquido >= 0 ? "green" : "red"} icon={TrendingUp} label="Lucro líquido" value={lucroLiquido} />
            <Kpi color={saldoCaixa >= 0 ? "green" : "red"} icon={Wallet} label="Saldo caixa" value={saldoCaixa} />
          </div>

          <Card className="border-border/50" style={{ boxShadow: "var(--shadow-card)" }}>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2"><Target className="w-4 h-4 text-primary" />Meta mensal</CardTitle>
              <Badge variant="secondary">{metaPct.toFixed(0)}%</Badge>
            </CardHeader>
            <CardContent>
              <div className="flex justify-between text-sm mb-2">
                <span className="text-muted-foreground">{formatCurrency(k.mes)} de {formatCurrency(metaMensal)}</span>
                <span className="font-medium">{formatCurrency(Math.max(0, metaMensal - k.mes))} restante</span>
              </div>
              <Progress value={metaPct} className="h-3" />
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="border-border/50" style={{ boxShadow: "var(--shadow-card)" }}>
              <CardHeader><CardTitle className="text-base">Faturamento × Despesas × Lucro (12 meses)</CardTitle></CardHeader>
              <CardContent className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={monthChart}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="mes" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickFormatter={(v) => `R$ ${Math.round(v/1000)}k`} />
                    <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} formatter={(v: any) => formatCurrency(Number(v))} />
                    <Legend />
                    <Line type="monotone" dataKey="Faturamento" stroke="#3b82f6" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="Despesas" stroke="#ef4444" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="Lucro" stroke="#10b981" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="border-border/50" style={{ boxShadow: "var(--shadow-card)" }}>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><PieIcon className="w-4 h-4" />Despesas por categoria</CardTitle></CardHeader>
              <CardContent className="h-[300px]">
                {expensesByCategory.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-sm text-muted-foreground">Sem despesas no período.</div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={expensesByCategory} dataKey="value" nameKey="name" outerRadius={100} label={(d: any) => d.name}>
                        {expensesByCategory.map((e, i) => <Cell key={i} fill={e.fill} />)}
                      </Pie>
                      <Tooltip formatter={(v: any) => formatCurrency(Number(v))} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>

          <Card className="border-border/50" style={{ boxShadow: "var(--shadow-card)" }}>
            <CardHeader><CardTitle className="text-base">Evolução do caixa</CardTitle></CardHeader>
            <CardContent className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={cashEvolution}>
                  <defs>
                    <linearGradient id="grad-saldo" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10b981" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="mes" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickFormatter={(v) => `R$ ${Math.round(v/1000)}k`} />
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} formatter={(v: any) => formatCurrency(Number(v))} />
                  <Area type="monotone" dataKey="Saldo" stroke="#10b981" fill="url(#grad-saldo)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        {/* INCOMES */}
        <TabsContent value="incomes" className="space-y-4">
          <Card className="border-border/50" style={{ boxShadow: "var(--shadow-card)" }}>
            <CardContent className="p-4 grid gap-3 md:grid-cols-3 lg:grid-cols-6">
              <FilterSelect label="Vendedor" value={fSeller} setValue={setFSeller} options={[{ id: "all", name: "Todos" }, ...(sellers.data ?? [])]} />
              <FilterSelect label="Produtor" value={fProducer} setValue={setFProducer} options={[{ id: "all", name: "Todos" }, ...(producers.data ?? [])]} />
              <FilterSelect label="Cliente" value={fCustomer} setValue={setFCustomer} options={[{ id: "all", name: "Todos" }, ...(customers.data ?? [])]} />
              <FilterSelect label="Serviço" value={fStype} setValue={setFStype} options={[{ id: "all", name: "Todos" }, ...(serviceTypes.data ?? [])]} />
              <FilterSelect label="Forma" value={fMethod} setValue={setFMethod} options={[
                { id: "all", name: "Todas" }, { id: "pix", name: "PIX" }, { id: "cartao", name: "Cartão" },
                { id: "boleto", name: "Boleto" }, { id: "dinheiro", name: "Dinheiro" }, { id: "transferencia", name: "Transferência" },
              ]} />
              <FilterSelect label="Status" value={fStatus} setValue={setFStatus} options={[
                { id: "all", name: "Todos" }, { id: "pago_total", name: "Pago total" },
                { id: "pago_parcial", name: "Parcial" }, { id: "pendente", name: "Pendente" },
              ]} />
            </CardContent>
          </Card>

          <Card className="border-border/50" style={{ boxShadow: "var(--shadow-card)" }}>
            <CardHeader><CardTitle className="text-base">Recebimentos por forma de pagamento</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Forma</TableHead>
                    <TableHead className="text-center">Vendas</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Pago</TableHead>
                    <TableHead className="text-right">A receber</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {byMethod.map((v) => (
                    <TableRow key={v.method}>
                      <TableCell><Badge variant="outline">{v.label}</Badge></TableCell>
                      <TableCell className="text-center">{v.qtd}</TableCell>
                      <TableCell className="text-right font-medium">{formatCurrency(v.total)}</TableCell>
                      <TableCell className="text-right text-emerald-500">{formatCurrency(v.pago)}</TableCell>
                      <TableCell className="text-right text-amber-500">{formatCurrency(v.total - v.pago)}</TableCell>
                    </TableRow>
                  ))}
                  {byMethod.length === 0 && (
                    <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Sem entradas no período.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card className="border-border/50" style={{ boxShadow: "var(--shadow-card)" }}>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Entradas ({incomesFiltered.length})</CardTitle>
              <Button variant="outline" size="sm" onClick={exportIncomes}><Download className="w-4 h-4 mr-2" />CSV</Button>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead><TableHead>Cliente</TableHead><TableHead>Vendedor</TableHead>
                    <TableHead>Produtor</TableHead><TableHead>Serviço</TableHead><TableHead>Forma</TableHead>
                    <TableHead>Status</TableHead><TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Pago</TableHead><TableHead className="text-right">Restante</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {incomesFiltered.map((s: any) => {
                    const rest = Number(s.total_amount) - Number(s.paid_amount);
                    return (
                      <TableRow key={s.id}>
                        <TableCell>{fmtDate(s.sale_date)}</TableCell>
                        <TableCell>{lookup.customers.get(s.customer_id) ?? "—"}</TableCell>
                        <TableCell>{lookup.sellers.get(s.seller_id) ?? "—"}</TableCell>
                        <TableCell>{lookup.producers.get(s.producer_id) ?? "—"}</TableCell>
                        <TableCell>{lookup.serviceTypes.get(s.service_type_id) ?? "—"}</TableCell>
                        <TableCell><Badge variant="outline">{s.payment_method ?? "—"}</Badge></TableCell>
                        <TableCell><StatusBadge status={s.payment_status} /></TableCell>
                        <TableCell className="text-right font-medium">{formatCurrency(Number(s.total_amount))}</TableCell>
                        <TableCell className="text-right text-emerald-500">{formatCurrency(Number(s.paid_amount))}</TableCell>
                        <TableCell className="text-right text-amber-500">{formatCurrency(rest)}</TableCell>
                      </TableRow>
                    );
                  })}
                  {incomesFiltered.length === 0 && (
                    <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground py-8">Sem entradas no período.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* EXPENSES */}
        <TabsContent value="expenses" className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 flex-1">
              <Kpi color="red" icon={ArrowUpRight} label="Despesas no período" value={expensesInRange.reduce((a: number, e: any) => a + Number(e.amount), 0)} />
              <Kpi color="green" icon={CheckCircle2} label="Pagas" value={expensesInRange.filter((e: any) => e.status === "pago").reduce((a: number, e: any) => a + Number(e.amount), 0)} />
              <Kpi color="yellow" icon={Clock} label="Pendentes" value={expensesInRange.filter((e: any) => e.status === "pendente").reduce((a: number, e: any) => a + Number(e.amount), 0)} />
              <Kpi color="red" icon={AlertTriangle} label="Atrasadas" value={expensesInRange.filter((e: any) => e.status === "atrasado").reduce((a: number, e: any) => a + Number(e.amount), 0)} />
            </div>
          </div>

          <Card className="border-border/50" style={{ boxShadow: "var(--shadow-card)" }}>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Despesas</CardTitle>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={exportExpenses}><Download className="w-4 h-4 mr-2" />CSV</Button>
                <Dialog open={openExp} onOpenChange={setOpenExp}>
                  <DialogTrigger asChild><Button size="sm" onClick={openNew}><Plus className="w-4 h-4 mr-2" />Nova despesa</Button></DialogTrigger>
                  <DialogContent className="max-w-lg">
                    <DialogHeader><DialogTitle>{editing ? "Editar despesa" : "Nova despesa"}</DialogTitle></DialogHeader>
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="col-span-2"><Label>Nome</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
                        <div><Label>Categoria</Label>
                          <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>{Object.entries(CAT_LABEL).map(([k2, v]) => <SelectItem key={k2} value={k2}>{v}</SelectItem>)}</SelectContent>
                          </Select>
                        </div>
                        <div><Label>Valor</Label><Input type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
                        <div><Label>Vencimento</Label><Input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} /></div>
                        <div><Label>Pagamento</Label><Input type="date" value={form.paid_date} onChange={(e) => setForm({ ...form, paid_date: e.target.value })} /></div>
                        <div><Label>Status</Label>
                          <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="pendente">Pendente</SelectItem>
                              <SelectItem value="pago">Pago</SelectItem>
                              <SelectItem value="atrasado">Atrasado</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div><Label>Fornecedor</Label><Input value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} /></div>
                        <div className="col-span-2"><Label>Observação</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
                        <div className="col-span-2"><Label>Comprovante</Label>
                          <Input type="file" onChange={(e) => setReceiptFile(e.target.files?.[0] ?? null)} />
                          {form.receipt_url && <p className="text-xs text-muted-foreground mt-1">Atual: {form.receipt_url}</p>}
                        </div>
                      </div>
                    </div>
                    <DialogFooter><Button onClick={saveExpense}>Salvar</Button></DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead><TableHead>Categoria</TableHead>
                    <TableHead>Vencimento</TableHead><TableHead>Pagamento</TableHead>
                    <TableHead>Status</TableHead><TableHead className="text-right">Valor</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {expensesInRange.map((e: any) => (
                    <TableRow key={e.id} className="cursor-pointer">
                      <TableCell onClick={() => openEdit(e)}>
                        <div className="font-medium">{e.name}</div>
                        {e.supplier && <div className="text-xs text-muted-foreground">{e.supplier}</div>}
                      </TableCell>
                      <TableCell><Badge variant="outline">{CAT_LABEL[e.category] ?? e.category}</Badge></TableCell>
                      <TableCell>{fmtDate(e.due_date)}</TableCell>
                      <TableCell>{fmtDate(e.paid_date)}</TableCell>
                      <TableCell><ExpenseStatusBadge status={e.status} /></TableCell>
                      <TableCell className="text-right font-semibold">{formatCurrency(Number(e.amount))}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {e.receipt_url && <Button size="icon" variant="ghost" onClick={() => getReceiptUrl(e.receipt_url)}><Upload className="w-4 h-4" /></Button>}
                          {e.status !== "pago" && <Button size="sm" variant="outline" onClick={() => markAsPaid(e.id)}>Pagar</Button>}
                          <Button size="icon" variant="ghost" onClick={() => deleteExpense(e.id)}><Trash2 className="w-4 h-4 text-red-500" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {expensesInRange.length === 0 && (
                    <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Sem despesas no período.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* CASH */}
        <TabsContent value="cash" className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Kpi color="green" icon={ArrowDownRight} label="Entradas (vendas pagas exceto cartão)" value={totalPaid(salesAll.filter((s: any) => s.payment_method !== "cartao"))} />
            <Kpi color="green" icon={ArrowDownRight} label="Entradas manuais" value={entradasManuais} />
            <Kpi color="red" icon={ArrowUpRight} label="Saídas (despesas + manuais)" value={totalDespesasPagas + saidasManuais} />
            <Kpi color={saldoCaixa >= 0 ? "green" : "red"} icon={Wallet} label="Saldo atual" value={saldoCaixa} />
          </div>

          <Card className="border-border/50" style={{ boxShadow: "var(--shadow-card)" }}>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Contas a pagar (próximas)</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader><TableRow><TableHead>Nome</TableHead><TableHead>Vencimento</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Valor</TableHead></TableRow></TableHeader>
                <TableBody>
                  {expensesAll.filter((e: any) => e.status !== "pago").slice(0, 10).map((e: any) => (
                    <TableRow key={e.id}>
                      <TableCell>{e.name}</TableCell>
                      <TableCell>{fmtDate(e.due_date)}</TableCell>
                      <TableCell><ExpenseStatusBadge status={e.status} /></TableCell>
                      <TableCell className="text-right font-medium">{formatCurrency(Number(e.amount))}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card className="border-border/50" style={{ boxShadow: "var(--shadow-card)" }}>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Movimentações manuais</CardTitle>
              <Dialog open={openMove} onOpenChange={setOpenMove}>
                <DialogTrigger asChild><Button size="sm"><Plus className="w-4 h-4 mr-2" />Nova movimentação</Button></DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Nova movimentação de caixa</DialogTitle></DialogHeader>
                  <div className="space-y-3">
                    <div><Label>Tipo</Label>
                      <Select value={moveForm.movement_type} onValueChange={(v) => setMoveForm({ ...moveForm, movement_type: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="entrada">Entrada</SelectItem>
                          <SelectItem value="saida">Saída</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div><Label>Valor</Label><Input type="number" step="0.01" value={moveForm.amount} onChange={(e) => setMoveForm({ ...moveForm, amount: e.target.value })} /></div>
                    <div><Label>Data</Label><Input type="date" value={moveForm.movement_date} onChange={(e) => setMoveForm({ ...moveForm, movement_date: e.target.value })} /></div>
                    <div><Label>Categoria</Label><Input value={moveForm.category} onChange={(e) => setMoveForm({ ...moveForm, category: e.target.value })} /></div>
                    <div><Label>Descrição</Label><Textarea value={moveForm.description} onChange={(e) => setMoveForm({ ...moveForm, description: e.target.value })} /></div>
                  </div>
                  <DialogFooter><Button onClick={saveMovement}>Registrar</Button></DialogFooter>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Tipo</TableHead><TableHead>Descrição</TableHead><TableHead className="text-right">Valor</TableHead></TableRow></TableHeader>
                <TableBody>
                  {moves.slice(0, 20).map((m: any) => (
                    <TableRow key={m.id}>
                      <TableCell>{fmtDate(m.movement_date)}</TableCell>
                      <TableCell>
                        <Badge className={m.movement_type === "entrada" ? "bg-emerald-500/15 text-emerald-500 border-emerald-500/30" : "bg-red-500/15 text-red-500 border-red-500/30"}>
                          {m.movement_type}
                        </Badge>
                      </TableCell>
                      <TableCell>{m.description ?? "—"}{m.category ? <span className="text-xs text-muted-foreground"> · {m.category}</span> : null}</TableCell>
                      <TableCell className={`text-right font-medium ${m.movement_type === "entrada" ? "text-emerald-500" : "text-red-500"}`}>
                        {m.movement_type === "entrada" ? "+" : "-"} {formatCurrency(Number(m.amount))}
                      </TableCell>
                    </TableRow>
                  ))}
                  {moves.length === 0 && (
                    <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">Sem movimentações.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* SALES */}
        <TabsContent value="sales" className="space-y-4">
          <Card className="border-border/50" style={{ boxShadow: "var(--shadow-card)" }}>
            <CardHeader><CardTitle className="text-base">Vendas por vendedor</CardTitle></CardHeader>
            <CardContent className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={salesBySeller}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickFormatter={(v) => `R$ ${Math.round(v/1000)}k`} />
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} formatter={(v: any) => formatCurrency(Number(v))} />
                  <Legend />
                  <Bar dataKey="Vendido" fill="#3b82f6" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="Pago" fill="#10b981" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="Comissao" fill="#f59e0b" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="border-border/50" style={{ boxShadow: "var(--shadow-card)" }}>
              <CardHeader><CardTitle className="text-base">Ranking de vendedores</CardTitle></CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader><TableRow><TableHead>#</TableHead><TableHead>Vendedor</TableHead><TableHead className="text-center">Vendas</TableHead><TableHead className="text-right">Total</TableHead><TableHead className="text-right">Comissão</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {salesBySeller.map((s, i) => (
                      <TableRow key={s.name}>
                        <TableCell>{i + 1}</TableCell>
                        <TableCell className="font-medium">{s.name}</TableCell>
                        <TableCell className="text-center">{s.Vendas}</TableCell>
                        <TableCell className="text-right">{formatCurrency(s.Vendido)}</TableCell>
                        <TableCell className="text-right text-emerald-500">{formatCurrency(s.Comissao)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card className="border-border/50" style={{ boxShadow: "var(--shadow-card)" }}>
              <CardHeader><CardTitle className="text-base">Top clientes & serviços</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <div className="text-xs font-semibold uppercase text-muted-foreground mb-2">Clientes</div>
                  {topCustomers.map((c) => (
                    <div key={c.name} className="flex justify-between py-1 border-b border-border/40 last:border-0">
                      <span className="text-sm">{c.name}</span>
                      <span className="text-sm font-medium">{formatCurrency(c.valor)} <span className="text-xs text-muted-foreground">({c.qtd})</span></span>
                    </div>
                  ))}
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase text-muted-foreground mb-2">Serviços</div>
                  {topServices.map((c) => (
                    <div key={c.name} className="flex justify-between py-1 border-b border-border/40 last:border-0">
                      <span className="text-sm">{c.name}</span>
                      <span className="text-sm font-medium">{formatCurrency(c.valor)} <span className="text-xs text-muted-foreground">({c.qtd})</span></span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
        
        {/* PAGAR.ME */}
        <TabsContent value="pagarme" className="space-y-4">
          <Card className="border-border/50" style={{ boxShadow: "var(--shadow-card)" }}>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2"><CreditCard className="w-4 h-4 text-emerald-600" /> Histórico de Pagamentos Cartão/PIX</CardTitle>
              <Button variant="outline" size="sm" asChild>
                <Link to="/pagarme-history">Ver detalhes completos</Link>
              </Button>
            </CardHeader>
            <CardContent className="p-0 overflow-hidden">
               <iframe 
                src="/pagarme-history" 
                className="w-full h-[800px] border-0" 
                title="Histórico Pagarme"
               />
            </CardContent>
          </Card>
        </TabsContent>

        {/* PRODUCTION */}
        <TabsContent value="prod" className="space-y-4">
          <Card className="border-border/50" style={{ boxShadow: "var(--shadow-card)" }}>
            <CardHeader><CardTitle className="text-base">Produção por produtor</CardTitle></CardHeader>
            <CardContent className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={prodByProducer}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <YAxis yAxisId="left" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <YAxis yAxisId="right" orientation="right" stroke="hsl(var(--muted-foreground))" fontSize={12} tickFormatter={(v) => `R$ ${Math.round(v/1000)}k`} />
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                  <Legend />
                  <Bar yAxisId="left" dataKey="Quantidade" fill="#8b5cf6" radius={[6, 6, 0, 0]} />
                  <Bar yAxisId="right" dataKey="Valor" fill="#06b6d4" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="border-border/50" style={{ boxShadow: "var(--shadow-card)" }}>
            <CardHeader><CardTitle className="text-base">Ranking de produtores</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader><TableRow><TableHead>#</TableHead><TableHead>Produtor</TableHead><TableHead className="text-center">Quantidade</TableHead><TableHead className="text-right">Valor produzido</TableHead></TableRow></TableHeader>
                <TableBody>
                  {prodByProducer.map((p, i) => (
                    <TableRow key={p.name}>
                      <TableCell>{i + 1}</TableCell>
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell className="text-center">{p.Quantidade}</TableCell>
                      <TableCell className="text-right">{formatCurrency(p.Valor)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* REPORTS */}
        <TabsContent value="reports" className="space-y-4">
          <Card className="border-border/50" style={{ boxShadow: "var(--shadow-card)" }}>
            <CardHeader><CardTitle className="text-base">Exportar relatórios</CardTitle></CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              <Button variant="outline" onClick={exportIncomes}><Download className="w-4 h-4 mr-2" />Entradas (CSV)</Button>
              <Button variant="outline" onClick={exportExpenses}><Download className="w-4 h-4 mr-2" />Despesas (CSV)</Button>
              <Button variant="outline" onClick={exportPdf}><Download className="w-4 h-4 mr-2" />Relatório completo (PDF)</Button>
              <Button variant="outline" onClick={() => downloadCsv(`vendedores-${range.from}_${range.to}.csv`, [
                ["Vendedor", "Vendas", "Vendido", "Pago", "Comissão"],
                ...salesBySeller.map((s) => [s.name, s.Vendas, s.Vendido.toFixed(2), s.Pago.toFixed(2), s.Comissao.toFixed(2)]),
              ])}><Download className="w-4 h-4 mr-2" />Por vendedor (CSV)</Button>
              <Button variant="outline" onClick={() => downloadCsv(`produtores-${range.from}_${range.to}.csv`, [
                ["Produtor", "Quantidade", "Valor"],
                ...prodByProducer.map((p) => [p.name, p.Quantidade, p.Valor.toFixed(2)]),
              ])}><Download className="w-4 h-4 mr-2" />Por produtor (CSV)</Button>
              <Button variant="outline" onClick={() => downloadCsv(`servicos-${range.from}_${range.to}.csv`, [
                ["Serviço", "Quantidade", "Valor"],
                ...topServices.map((s) => [s.name, s.qtd, s.valor.toFixed(2)]),
              ])}><Download className="w-4 h-4 mr-2" />Por serviço (CSV)</Button>
            </CardContent>
          </Card>

          <Card className="border-border/50" style={{ boxShadow: "var(--shadow-card)" }}>
            <CardHeader><CardTitle className="text-base">Resumo do período</CardTitle></CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
              <Kpi color="blue" icon={DollarSign} label="Faturamento" value={totalSale(salesInRange)} />
              <Kpi color="green" icon={CheckCircle2} label="Recebido" value={totalPaid(salesInRange)} />
              <Kpi color="red" icon={ArrowUpRight} label="Despesas" value={expensesInRange.reduce((a: number, e: any) => a + Number(e.amount), 0)} />
              <Kpi color={(totalPaid(salesInRange) - expensesInRange.filter((e: any) => e.status === "pago").reduce((a: number, e: any) => a + Number(e.amount), 0)) >= 0 ? "green" : "red"} icon={TrendingUp} label="Lucro líquido" value={totalPaid(salesInRange) - expensesInRange.filter((e: any) => e.status === "pago").reduce((a: number, e: any) => a + Number(e.amount), 0)} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ---------- Small components ----------
function Kpi({ color, icon: Icon, label, value }: { color: "green" | "red" | "yellow" | "blue"; icon: any; label: string; value: number }) {
  const palette: Record<string, { bg: string; text: string; ring: string }> = {
    green: { bg: "bg-emerald-500/10", text: "text-emerald-500", ring: "ring-emerald-500/20" },
    red: { bg: "bg-red-500/10", text: "text-red-500", ring: "ring-red-500/20" },
    yellow: { bg: "bg-amber-500/10", text: "text-amber-500", ring: "ring-amber-500/20" },
    blue: { bg: "bg-blue-500/10", text: "text-blue-500", ring: "ring-blue-500/20" },
  };
  const p = palette[color];
  return (
    <Card className={`border-border/50 ring-1 ${p.ring}`} style={{ boxShadow: "var(--shadow-card)" }}>
      <CardContent className="p-4 flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">{label}</p>
          <p className={`text-xl font-bold tracking-tight ${p.text}`}>{formatCurrency(value)}</p>
        </div>
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${p.bg}`}>
          <Icon className={`w-5 h-5 ${p.text}`} />
        </div>
      </CardContent>
    </Card>
  );
}

function FilterSelect({ label, value, setValue, options }: { label: string; value: string; setValue: (v: string) => void; options: { id: string; name: string }[] }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Select value={value} onValueChange={setValue}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>{options.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}</SelectContent>
      </Select>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pago_total: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30",
    pago_parcial: "bg-amber-500/15 text-amber-500 border-amber-500/30",
    pendente: "bg-red-500/15 text-red-500 border-red-500/30",
  };
  return <Badge variant="outline" className={map[status] ?? ""}>{status}</Badge>;
}
function ExpenseStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pago: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30",
    pendente: "bg-amber-500/15 text-amber-500 border-amber-500/30",
    atrasado: "bg-red-500/15 text-red-500 border-red-500/30",
  };
  return <Badge variant="outline" className={map[status] ?? ""}>{status}</Badge>;
}