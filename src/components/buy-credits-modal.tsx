import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Coins, Check, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";

type Pkg = {
  id: string;
  name: string;
  tokens: number;
  price_cents: number;
  badge: string | null;
  sort_order: number;
};

const formatBRL = (c: number) =>
  (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const formatTokens = (n: number) => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toLocaleString("pt-BR")}M`;
  if (n >= 1_000) return `${(n / 1_000).toLocaleString("pt-BR")}k`;
  return `${n}`;
};

export function BuyCreditsModal({
  open,
  onOpenChange,
  onPurchased,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onPurchased?: () => void;
}) {
  const [packages, setPackages] = useState<Pkg[]>([]);
  const [loading, setLoading] = useState(true);
  const [buyingId, setBuyingId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("credit_packages")
        .select("*")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      setLoading(false);
      if (error) return toast.error(error.message);
      setPackages((data ?? []) as Pkg[]);
    })();
  }, [open]);

  const buy = async (pkg: Pkg) => {
    setBuyingId(pkg.id);
    const { error } = await supabase.rpc("create_credit_order", {
      _package_id: pkg.id,
    });
    setBuyingId(null);
    if (error) return toast.error(error.message);
    toast.success("Pedido criado! Integração de pagamento em breve.");
    onPurchased?.();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-2xl">
            <Coins className="h-6 w-6 text-emerald-400" />
            Comprar Créditos IA
          </DialogTitle>
          <DialogDescription>
            Os créditos comprados não expiram e são consumidos após os inclusos no seu plano.
          </DialogDescription>
        </DialogHeader>
        {loading ? (
          <div className="p-8 flex justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 pt-4">
            {packages.map((p, i) => {
              const highlight = !!p.badge;
              const pricePerMillion = p.price_cents / (p.tokens / 1_000_000) / 100;
              return (
                <div
                  key={p.id}
                  style={{ animationDelay: `${i * 60}ms`, animationFillMode: "both" }}
                  className={`group relative flex flex-col p-5 pt-7 rounded-2xl transition-all duration-300 ease-out animate-fade-in hover:-translate-y-1 hover:shadow-xl ${
                    highlight
                      ? "bg-gradient-to-b from-emerald-500/15 via-card to-card border-2 border-emerald-500/60 shadow-lg shadow-emerald-500/10"
                      : "bg-gradient-to-b from-primary/[0.06] via-card to-card border border-border hover:border-primary/40"
                  }`}
                >
                  <div className="pointer-events-none absolute inset-0 rounded-2xl overflow-hidden">
                    <div
                      className={`absolute inset-x-0 -top-20 h-32 opacity-60 blur-2xl ${
                        highlight ? "bg-emerald-500/20" : "bg-primary/10"
                      }`}
                    />
                  </div>
                  {p.badge && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-emerald-500 text-white text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full shadow-lg shadow-emerald-500/30 whitespace-nowrap z-10">
                      {p.badge}
                    </div>
                  )}
                  <div className="relative flex items-center gap-2">
                    <div
                      className={`p-1.5 rounded-lg ${
                        highlight
                          ? "bg-emerald-500/15 text-emerald-400"
                          : "bg-primary/10 text-primary"
                      }`}
                    >
                      <Sparkles className="w-4 h-4" strokeWidth={2.5} />
                    </div>
                    <h3 className="text-sm font-bold text-foreground">
                      {formatTokens(p.tokens)} Tokens
                    </h3>
                  </div>
                  <div className="relative mt-4 flex items-baseline gap-1">
                    <span className="text-lg font-bold text-foreground/80">R$</span>
                    <span className="text-3xl font-black tracking-tight leading-none text-foreground">
                      {(p.price_cents / 100).toLocaleString("pt-BR", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </span>
                  </div>
                  <p className="relative text-[11px] text-muted-foreground mt-1">
                    {formatBRL(Math.round(pricePerMillion * 100))} por milhão
                  </p>
                  <div className="relative my-4 h-px bg-border/60" />
                  <ul className="relative space-y-1.5 flex-grow text-xs text-muted-foreground">
                    <li className="flex items-start gap-2">
                      <Check className="w-4 h-4 shrink-0 mt-0.5 text-emerald-400" strokeWidth={2.5} />
                      <span>Créditos não expiram</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="w-4 h-4 shrink-0 mt-0.5 text-emerald-400" strokeWidth={2.5} />
                      <span>Adicionado ao saldo instantaneamente</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="w-4 h-4 shrink-0 mt-0.5 text-emerald-400" strokeWidth={2.5} />
                      <span>Usado após esgotar o plano</span>
                    </li>
                  </ul>
                  <Button
                    onClick={() => buy(p)}
                    disabled={buyingId !== null}
                    className={`relative mt-5 w-full py-2.5 h-auto rounded-xl font-bold text-sm transition-all ${
                      highlight
                        ? "bg-emerald-500 hover:bg-emerald-600 text-white shadow-lg shadow-emerald-500/30 active:scale-95"
                        : "bg-transparent border border-border text-foreground hover:bg-muted/60"
                    }`}
                  >
                    {buyingId === p.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : highlight ? (
                      "Comprar Agora"
                    ) : (
                      "Comprar"
                    )}
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}