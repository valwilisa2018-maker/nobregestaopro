import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Copy, ExternalLink } from "lucide-react";
import { createPaymentLink } from "@/lib/pagarme.functions";

export const Route = createFileRoute("/_authenticated/payment-link")({
  component: PaymentLinkPage,
});

function PaymentLinkPage() {
  const callCreate = useServerFn(createPaymentLink);
  const [name, setName] = useState("Pagamento Nobre MKT");
  const [valueBrl, setValueBrl] = useState("");
  const [installments, setInstallments] = useState("1");
  const [methods, setMethods] = useState<{ credit_card: boolean; pix: boolean; boleto: boolean }>({
    credit_card: true, pix: true, boleto: false,
  });
  const [loading, setLoading] = useState(false);
  const [link, setLink] = useState<string | null>(null);

  const submit = async () => {
    const v = Number(valueBrl.replace(",", "."));
    if (!v || v <= 0) return toast.error("Informe um valor válido");
    const selected = (Object.keys(methods) as Array<keyof typeof methods>).filter((k) => methods[k]);
    if (selected.length === 0) return toast.error("Selecione ao menos um método de pagamento");
    setLoading(true); setLink(null);
    try {
      const res = await callCreate({ data: {
        name: name.trim() || "Pagamento",
        amount: Math.round(v * 100),
        installments: Number(installments) || 1,
        methods: selected,
      }});
      if (!res.ok) toast.error(res.error);
      else { setLink(res.url); toast.success("Link gerado!"); }
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao gerar link");
    } finally { setLoading(false); }
  };

  const copy = async () => {
    if (!link) return;
    await navigator.clipboard.writeText(link);
    toast.success("Link copiado");
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Gerar Pagamento</h1>
        <p className="text-muted-foreground">Crie um link de pagamento via Pagar.me</p>
      </div>

      <Card className="border-border/50">
        <CardHeader><CardTitle className="text-base">Dados do pagamento</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label>Descrição</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Valor (R$)</Label>
              <Input inputMode="decimal" placeholder="0,00" value={valueBrl} onChange={(e) => setValueBrl(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Parcelas</Label>
              <Input type="number" min={1} max={12} value={installments} onChange={(e) => setInstallments(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Métodos aceitos</Label>
            <div className="flex gap-4 flex-wrap">
              {([
                ["credit_card", "Cartão de Crédito"],
                ["pix", "Pix"],
                ["boleto", "Boleto"],
              ] as const).map(([k, l]) => (
                <label key={k} className="flex items-center gap-2 text-sm">
                  <Checkbox checked={methods[k]} onCheckedChange={(c) => setMethods((m) => ({ ...m, [k]: !!c }))} />
                  {l}
                </label>
              ))}
            </div>
          </div>
          <Button onClick={submit} disabled={loading}>{loading ? "Gerando…" : "Gerar link"}</Button>

          {link && (
            <div className="p-3 rounded-lg border border-border/50 bg-muted/30 space-y-2">
              <div className="text-xs text-muted-foreground">Link gerado</div>
              <div className="text-sm break-all">{link}</div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={copy}><Copy className="w-3 h-3 mr-1" />Copiar</Button>
                <Button size="sm" variant="outline" asChild><a href={link} target="_blank" rel="noreferrer"><ExternalLink className="w-3 h-3 mr-1" />Abrir</a></Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}