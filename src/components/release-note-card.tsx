import { useState, useEffect } from "react";
import { X, Sparkles, Megaphone, CheckCircle2, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// Define the latest update ID. Increment this when a new important update is released.
const LATEST_UPDATE_ID = "update-influencer-auto-producer-v1";

export function ReleaseNoteCard() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const dismissed = localStorage.getItem("dismissed-" + LATEST_UPDATE_ID);
    if (!dismissed) {
      // Small delay to ensure smooth entry after page load
      const timer = setTimeout(() => setOpen(true), 1500);
      return () => clearTimeout(timer);
    }
  }, []);

  const dismiss = () => {
    localStorage.setItem("dismissed-" + LATEST_UPDATE_ID, "true");
    setOpen(false);
  };

  if (!open) return null;

  return (
    <div className="fixed bottom-6 right-6 z-[100] w-[380px] animate-in fade-in slide-in-from-bottom-8 duration-500">
      <div className="relative group">
        {/* Premium Glow Effect */}
        <div className="absolute -inset-0.5 bg-gradient-to-r from-primary/50 via-purple-500/30 to-primary/50 rounded-2xl blur opacity-30 group-hover:opacity-60 transition duration-1000 group-hover:duration-200" />
        
        <div className="relative flex flex-col bg-card border-2 border-primary/20 rounded-2xl shadow-2xl overflow-hidden">
          {/* Header with Luxury Gradient */}
          <div className="bg-gradient-to-br from-zinc-900 via-zinc-900 to-zinc-800 p-5 text-white">
            <div className="flex justify-between items-start mb-2">
              <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30 text-[10px] uppercase tracking-tighter px-2">
                Nova Atualização
              </Badge>
              <button 
                onClick={dismiss}
                className="text-zinc-400 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-primary/20 border border-primary/30 shadow-inner">
                <Megaphone className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h3 className="text-lg font-bold tracking-tight leading-tight">Gestão Inteligente</h3>
                <p className="text-xs text-zinc-400">Automatização Influencers</p>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="p-5 space-y-4 bg-card/50 backdrop-blur-xl">
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground leading-relaxed">
                A partir de agora, todas as melhorias e novas regras serão informadas diretamente aqui.
              </p>
              
              <div className="space-y-2">
                <div className="flex items-start gap-3 p-3 rounded-xl bg-muted/50 border border-border/50 transition-colors hover:bg-muted/80">
                  <div className="mt-0.5 rounded-full bg-green-500/10 p-1">
                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-foreground">Regra de Influencers</p>
                    <p className="text-[11px] text-muted-foreground leading-snug">
                      Vendas da <strong>Ester</strong> ou <strong>Pamela</strong> agora selecionam automaticamente o produtor 
                      <span className="text-primary font-medium"> GRAVAÇÃO INFLUENCER</span>.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <Button 
              onClick={dismiss}
              className="w-full group/btn bg-primary hover:bg-primary/90 text-primary-foreground font-bold h-11 rounded-xl shadow-lg shadow-primary/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
            >
              Entendido
              <ChevronRight className="w-4 h-4 ml-2 group-hover/btn:translate-x-1 transition-transform" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
