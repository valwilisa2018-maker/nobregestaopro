import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Coins, Check, Loader2, Zap, Rocket, Crown, Gem } from "lucide-react";
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

  const tierIcons = [Zap, Rocket, Crown, Gem];

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
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { toast.error("Sessão expirada"); return; }
      const res = await fetch("/api/v1/buy", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ package_id: pkg.id }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(body?.error ?? "Falha ao criar pedido"); return; }
      toast.success("Pedido criado! Integração de pagamento em breve.");
      onPurchased?.();
      onOpenChange(false);
    } finally {
      setBuyingId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader className="text-center items-center space-y-2">
          <div className="mx-auto mb-1 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400/20 to-emerald-600/10 border border-emerald-500/30 shadow-lg shadow-emerald-500/10">
            <Coins className="h-6 w-6 text-emerald-400" />
          </div>
          <DialogTitle className="text-xl sm:text-2xl font-bold">Comprar Créditos IA</DialogTitle>
          <DialogDescription className="max-w-md text-xs sm:text-sm">
            Escolha o pacote ideal. Créditos não expiram e são consumidos após os inclusos no plano.
          </DialogDescription>
        </DialogHeader>
        {loading ? (
          <div className="p-8 flex justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : (
          <div className="grid gap-3 sm:gap-4 sm:grid-cols-2 xl:grid-cols-4 pt-3 sm:pt-4">
            {packages.map((p, i) => {
              const highlight = !!p.badge;
              const pricePerMillion = p.price_cents / (p.tokens / 1_000_000) / 100;
              const Icon = tierIcons[i] ?? Zap;
              return (
                <div
                  key={p.id}
                  style={{ animationDelay: `${i * 60}ms`, animationFillMode: "both" }}
                  className={`group relative flex flex-col p-4 sm:p-5 pt-6 sm:pt-7 rounded-2xl transition-all duration-300 ease-out animate-fade-in sm:hover:-translate-y-1 hover:shadow-xl ${
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
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-emerald-500 text-foreground text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full shadow-lg shadow-emerald-500/30 whitespace-nowrap z-10">
                      {p.badge}
                    </div>
                  )}
                  <div className="relative flex items-center gap-2.5">
                    <div
                      className={`p-2 rounded-xl ${
                        highlight
                          ? "bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30"
                          : "bg-primary/10 text-primary ring-1 ring-primary/20"
                      }`}
                    >
                      <Icon className="w-4 h-4" strokeWidth={2.5} />
                    </div>
                    <h3 className="text-base font-bold text-foreground tracking-tight">
                      {formatTokens(p.tokens)} Tokens
                    </h3>
                  </div>
                  <div className="relative mt-4 flex items-baseline gap-1.5">
                    <span className="text-base font-semibold text-muted-foreground">R$</span>
                    <span className="text-4xl font-black tracking-tight leading-none text-foreground">
                      {(p.price_cents / 100).toLocaleString("pt-BR", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </span>
                  </div>
                  <p className="relative text-[10px] font-semibold text-muted-foreground mt-1.5 uppercase tracking-wider">
                    {formatBRL(Math.round(pricePerMillion * 100))} / milhão
                  </p>
                  <div className="relative my-4 h-px bg-gradient-to-r from-transparent via-border to-transparent" />
                  <ul className="relative space-y-2 flex-grow text-xs text-muted-foreground">
                    <li className="flex items-start gap-2">
                      <Check className="w-4 h-4 shrink-0 mt-0.5 text-emerald-400" strokeWidth={2.5} />
                      <span>Créditos não expiram</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="w-4 h-4 shrink-0 mt-0.5 text-emerald-400" strokeWidth={2.5} />
                      <span>Saldo adicionado na hora</span>
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
                        ? "bg-emerald-500 hover:bg-emerald-600 text-foreground shadow-lg shadow-emerald-500/30 active:scale-95"
                        : "bg-muted/40 border border-border text-foreground hover:bg-muted/70 hover:border-primary/40"
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