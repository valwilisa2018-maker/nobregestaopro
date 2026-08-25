import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Calculator, Copy, ExternalLink, Loader2, Link2 } from "lucide-react";
import { createPaymentLink } from "@/lib/pagarme.functions";
import { supabase } from "@/integrations/supabase/client";
import { simulateInstallments, type FeePayer } from "@/lib/installment-simulator";

export const Route = createFileRoute("/_authenticated/payment-link")({
  component: PaymentLinkPage,
});

// Verde + branco — paleta fixa para a área Pagar.me (a pedido do usuário).
const GREEN = "#16a34a";          // emerald-600
const GREEN_DARK = "#15803d";     // emerald-700
const GREEN_SOFT = "#dcfce7";     // emerald-100
const GREEN_BORDER = "#86efac";   // emerald-300

function PaymentLinkPage() {
  const callCreate = useServerFn(createPaymentLink);
  const [name, setName] = useState("Pagamento Nobre MKT");
  const [valueBrl, setValueBrl] = useState("");
  const [installments, setInstallments] = useState("1");
  const [feePercent, setFeePercent] = useState("0");
  const [feePayer, setFeePayer] = useState<FeePayer>("customer");
  const [methods, setMethods] = useState<{ credit_card: boolean; pix: boolean; boleto: boolean }>({
    credit_card: true, pix: true, boleto: false,
  });
  const [loading, setLoading] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const numericValue = Number(valueBrl.replace(",", ".")) || 0;
  const numericFee = Number(feePercent.replace(",", ".")) || 0;
  const simulation = simulateInstallments(numericValue, numericFee, Number(installments), feePayer);
  const money = (value: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

  const submit = async () => {
    const v = Number(valueBrl.replace(",", "."));
    if (!v || v <= 0) return toast.error("Informe um valor válido");
    const selected = (Object.keys(methods) as Array<keyof typeof methods>).filter((k) => methods[k]);
    if (selected.length === 0) return toast.error("Selecione ao menos um método de pagamento");
    
    setLoading(true); setLink(null);
    try {
      const amountInCents = Math.round(v * 100);

      // Apenas gerar o link de pagamento — NÃO cria venda.
      const res = await callCreate({ data: {
        name: name.trim() || "Pagamento",
        amount: amountInCents,
        installments: Number(installments) || 1,
        methods: selected,
      }});

      if (!res.ok) {
        toast.error(res.error);
      } else { 
        setLink(res.url); 
        toast.success("Link gerado com sucesso!");
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao gerar link");
    } finally { setLoading(false); }
  };

  const copy = async () => {
    if (!link) return;
    await navigator.clipboard.writeText(link);
    toast.success("Link copiado");
  };

  // estilos verde/branco reutilizáveis
  const greenCardStyle: React.CSSProperties = {
    background: "#ffffff",
    borderColor: GREEN_BORDER,
    color: "#0a0a0a",
    boxShadow: "0 8px 28px -12px rgba(22,163,74,0.35)",
  };
  const greenInputClass =
    "bg-white text-neutral-900 placeholder:text-neutral-400 border-emerald-300 " +
    "focus-visible:ring-emerald-500 focus-visible:border-emerald-500";

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Cabeçalho verde */}
      <div
        className="rounded-2xl p-5 text-white"
        style={{
          background: `linear-gradient(135deg, ${GREEN}, ${GREEN_DARK})`,
          boxShadow: "0 12px 40px -12px rgba(22,163,74,0.55)",
        }}
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center">
            <Link2 className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Gerar Pagamento</h1>
            <p className="text-white/85 text-sm">
              Crie um link de pagamento via Pagar.me.
            </p>
          </div>
        </div>
      </div>

      {/* Dados do pagamento */}
      <Card className="border-2" style={greenCardStyle}>
        <CardHeader className="pb-3">
          <CardTitle className="text-base" style={{ color: GREEN_DARK }}>Dados do pagamento</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label style={{ color: GREEN_DARK }}>Descrição</Label>
            <Input className={greenInputClass} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label style={{ color: GREEN_DARK }}>Valor (R$)</Label>
              <Input className={greenInputClass} inputMode="decimal" placeholder="0,00" value={valueBrl} onChange={(e) => setValueBrl(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label style={{ color: GREEN_DARK }}>Parcelas</Label>
              <select
                className={`flex h-9 w-full rounded-md border px-3 py-1 text-sm shadow-xs outline-none ${greenInputClass}`}
                value={installments}
                onChange={(e) => setInstallments(e.target.value)}
              >
                {Array.from({ length: 12 }, (_, index) => index + 1).map((number) => (
                  <option key={number} value={number}>{number}x</option>
                ))}
              </select>
            </div>
          </div>
          <div
            className="rounded-xl border p-4 space-y-4"
            style={{ background: GREEN_SOFT, borderColor: GREEN_BORDER }}
          >
            <div className="flex items-start gap-3">
              <div className="rounded-lg bg-white p-2" style={{ color: GREEN_DARK }}>
                <Calculator className="h-5 w-5" />
              </div>
              <div>
                <div className="font-semibold" style={{ color: GREEN_DARK }}>Simular taxa do parcelamento</div>
                <p className="text-xs text-neutral-600">
                  Informe a taxa da operadora para calcular quanto cobrar do cliente e preservar o valor líquido.
                </p>
              </div>
            </div>
            <div className="space-y-1">
              <Label style={{ color: GREEN_DARK }}>Taxa total estimada (%)</Label>
              <Input
                className={greenInputClass}
                inputMode="decimal"
                placeholder="Ex.: 5,00"
                value={feePercent}
                onChange={(e) => setFeePercent(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label style={{ color: GREEN_DARK }}>Quem assume a taxa?</Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setFeePayer("customer")}
                  className={`rounded-lg border p-3 text-left text-sm transition-colors ${
                    feePayer === "customer"
                      ? "border-emerald-600 bg-emerald-600 text-white"
                      : "border-emerald-200 bg-white text-neutral-700"
                  }`}
                >
                  <span className="block font-semibold">Cliente paga a taxa</span>
                  <span className={feePayer === "customer" ? "text-white/80" : "text-neutral-500"}>
                    A taxa é acrescentada ao valor do link.
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setFeePayer("seller")}
                  className={`rounded-lg border p-3 text-left text-sm transition-colors ${
                    feePayer === "seller"
                      ? "border-emerald-600 bg-emerald-600 text-white"
                      : "border-emerald-200 bg-white text-neutral-700"
                  }`}
                >
                  <span className="block font-semibold">Vendedor assume a taxa</span>
                  <span className={feePayer === "seller" ? "text-white/80" : "text-neutral-500"}>
                    O cliente paga o valor original.
                  </span>
                </button>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm">
              <div className="rounded-lg bg-white p-3 border border-emerald-200">
                <div className="text-xs text-neutral-500">Taxa estimada</div>
                <div className="font-semibold text-neutral-900">{money(simulation.feeAmount)}</div>
              </div>
              <div className="rounded-lg bg-white p-3 border border-emerald-200">
                <div className="text-xs text-neutral-500">Total para o cliente</div>
                <div className="font-semibold text-neutral-900">{money(simulation.totalWithFee)}</div>
              </div>
              <div className="rounded-lg bg-white p-3 border border-emerald-200">
                <div className="text-xs text-neutral-500">{simulation.installments}x de</div>
                <div className="font-semibold text-neutral-900">{money(simulation.installmentAmount)}</div>
              </div>
            </div>
            <div className="rounded-lg bg-white p-3 border border-emerald-200 text-sm">
              <span className="text-neutral-500">Valor líquido estimado para a empresa: </span>
              <strong className="text-neutral-900">{money(simulation.netAmount)}</strong>
            </div>
            {feePayer === "customer" ? (
              <Button
                type="button"
                variant="outline"
                disabled={simulation.totalWithFee <= 0}
                onClick={() => {
                  setValueBrl(simulation.totalWithFee.toFixed(2));
                  setFeePercent("0");
                  toast.success("Total com a taxa aplicado ao link");
                }}
                className="bg-white border-emerald-300 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800"
              >
                Aplicar total de {money(simulation.totalWithFee)} ao link
              </Button>
            ) : (
              <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                O valor do link permanece em {money(simulation.totalWithFee)} e a taxa estimada de {money(simulation.feeAmount)} fica por conta da empresa.
              </p>
            )}
            <p className="text-[11px] text-neutral-500">
              Simulação estimada. Confirme a taxa vigente no seu contrato Pagar.me antes de enviar a cobrança.
            </p>
          </div>
          <div className="space-y-2">
            <Label style={{ color: GREEN_DARK }}>Métodos aceitos</Label>
            <div className="flex gap-4 flex-wrap">
              {([
                ["credit_card", "Cartão de Crédito"],
                ["pix", "Pix"],
                ["boleto", "Boleto"],
              ] as const).map(([k, l]) => (
                <label
                  key={k}
                  className="flex items-center gap-2 text-sm px-3 py-1.5 rounded-md border bg-white"
                  style={{ borderColor: GREEN_BORDER, color: GREEN_DARK }}
                >
                  <Checkbox
                    checked={methods[k]}
                    onCheckedChange={(c) => setMethods((m) => ({ ...m, [k]: !!c }))}
                    className="border-emerald-500 data-[state=checked]:bg-emerald-600 data-[state=checked]:border-emerald-600"
                  />
                  {l}
                </label>
              ))}
            </div>
          </div>

          <Button
            onClick={submit}
            disabled={loading}
            className="text-white font-semibold"
            style={{ background: GREEN, borderColor: GREEN_DARK }}
          >
            {loading ? (<><Loader2 className="w-4 h-4 mr-2 animate-spin" />Gerando…</>) : "Gerar link"}
          </Button>

          {link && (
            <div
              className="p-3 rounded-lg space-y-2"
              style={{ background: GREEN_SOFT, border: `1px solid ${GREEN_BORDER}` }}
            >
              <div className="text-xs font-semibold" style={{ color: GREEN_DARK }}>Link gerado</div>
              <div className="text-sm break-all text-neutral-800">{link}</div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={copy}
                  className="bg-white border-emerald-300 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800"
                >
                  <Copy className="w-3 h-3 mr-1" />Copiar
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  asChild
                  className="bg-white border-emerald-300 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800"
                >
                  <a href={link} target="_blank" rel="noreferrer">
                    <ExternalLink className="w-3 h-3 mr-1" />Abrir
                  </a>
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
