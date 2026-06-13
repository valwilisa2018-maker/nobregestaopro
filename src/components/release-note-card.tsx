import { useState, useEffect } from "react";
import { X, Megaphone, CheckCircle2, ChevronRight, AlertTriangle, Info, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import confetti from "canvas-confetti";
import { cn } from "@/lib/utils";

const LATEST_AUTO_UPDATE_ID = "update-operacao-metas-kanban-v1";

export function ReleaseNoteCard() {
  const [activeAnnouncement, setActiveAnnouncement] = useState<any>(null);
  const [showAutoUpdate, setShowAutoUpdate] = useState(false);

  // Fetch manual announcements
  const manualAnnouncements = useQuery({
    queryKey: ["active-announcements"],
    queryFn: async () => {
      const { data } = await supabase
        .from("system_announcements")
        .select("*")
        .eq("is_active" as any, true)
        .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
        .order("created_at", { ascending: false });
      return data ?? [];
    }
  });

  useEffect(() => {
    // Check for manual announcements first
    if (manualAnnouncements.data && manualAnnouncements.data.length > 0) {
      const first = manualAnnouncements.data[0];
      const dismissed = localStorage.getItem(`dismissed-manual-${(first as any).id}`);
      if (!dismissed) {
        setActiveAnnouncement(first);
        // Trigger confetti for manual announcements too
        const timer = setTimeout(() => {
          triggerConfetti();
        }, 500);
        return () => clearTimeout(timer);
      }
    }

    // If no manual announcement, check for the latest automatic update
    const autoDismissed = localStorage.getItem("dismissed-" + LATEST_AUTO_UPDATE_ID);
    if (!autoDismissed) {
      const timer = setTimeout(() => {
        setShowAutoUpdate(true);
        triggerConfetti();
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [manualAnnouncements.data]);

  const triggerConfetti = () => {
    const duration = 3 * 1000;
    const animationEnd = Date.now() + duration;
    const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 200 };
    const randomInRange = (min: number, max: number) => Math.random() * (max - min) + min;

    const interval: any = setInterval(function() {
      const timeLeft = animationEnd - Date.now();
      if (timeLeft <= 0) return clearInterval(interval);
      const particleCount = 50 * (timeLeft / duration);
      confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 } });
      confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 } });
    }, 250);
  };

  const dismissManual = () => {
    if (activeAnnouncement) {
      localStorage.setItem(`dismissed-manual-${activeAnnouncement.id}`, "true");
      setActiveAnnouncement(null);
    }
  };

  const dismissAuto = () => {
    localStorage.setItem("dismissed-" + LATEST_AUTO_UPDATE_ID, "true");
    setShowAutoUpdate(false);
  };

  if (!activeAnnouncement && !showAutoUpdate) return null;

  // Manual Announcement Content
  if (activeAnnouncement) {
    const iconMap: Record<string, any> = {
      info: <Info className="w-5 h-5 text-blue-400" />,
      warning: <AlertTriangle className="w-5 h-5 text-orange-400" />,
      maintenance: <AlertTriangle className="w-5 h-5 text-destructive" />,
      update: <Zap className="w-5 h-5 text-green-400" />,
    };

    const gradientMap: Record<string, string> = {
      info: "from-blue-600 to-blue-900",
      warning: "from-orange-600 to-orange-900",
      maintenance: "from-red-600 to-red-900",
      update: "from-emerald-600 to-emerald-900",
    };

    return (
      <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-background/60 backdrop-blur-md animate-in fade-in duration-500">
        <div className="relative w-full max-w-[440px] animate-in zoom-in-95 slide-in-from-bottom-10 duration-500">
          <div className="relative group">
            <div className={cn(
              "absolute -inset-1 rounded-2xl blur opacity-25 group-hover:opacity-40 transition duration-1000",
              activeAnnouncement.type === 'maintenance' ? "bg-destructive" : "bg-primary"
            )} />
            
            <div className="relative flex flex-col bg-card border-2 border-border/50 rounded-2xl shadow-2xl overflow-hidden">
              <div className={cn("p-6 text-white bg-gradient-to-br", gradientMap[activeAnnouncement.type] || "from-zinc-900 to-zinc-800")}>
                <div className="flex justify-between items-start mb-4">
                  <Badge variant="outline" className="bg-white/10 text-white border-white/20 text-[10px] uppercase tracking-widest px-2 py-0.5">
                    {activeAnnouncement.type === 'maintenance' ? 'Manutenção' : 'Comunicado'}
                  </Badge>
                  <button onClick={dismissManual} className="text-white/60 hover:text-white transition-colors">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-xl bg-white/10 border border-white/20 shadow-inner">
                    {iconMap[activeAnnouncement.type] || <Megaphone className="w-5 h-5" />}
                  </div>
                  <div>
                    <h3 className="text-xl font-bold tracking-tight leading-tight">{activeAnnouncement.title}</h3>
                    <p className="text-xs text-white/70">Aviso do Sistema</p>
                  </div>
                </div>
              </div>

              <div className="p-6 space-y-6 bg-card">
                <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap">
                  {activeAnnouncement.message}
                </p>

                <Button 
                  onClick={dismissManual}
                  className="w-full bg-foreground text-background hover:bg-foreground/90 font-bold h-12 rounded-xl transition-all hover:scale-[1.02] active:scale-[0.98]"
                >
                  Confirmar Leitura
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Auto Update Content (Existing Style)
  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-background/40 backdrop-blur-sm animate-in fade-in duration-500">
      <div className="relative w-full max-w-[420px] animate-in zoom-in-95 slide-in-from-bottom-10 duration-500">
        <div className="relative group">
          <div className="absolute -inset-0.5 bg-gradient-to-r from-primary/50 via-purple-500/30 to-primary/50 rounded-2xl blur opacity-30 group-hover:opacity-60 transition duration-1000 group-hover:duration-200" />
          
          <div className="relative flex flex-col bg-card border-2 border-primary/20 rounded-2xl shadow-2xl overflow-hidden">
            <div className="bg-gradient-to-br from-zinc-900 via-zinc-900 to-zinc-800 p-5 text-white">
              <div className="flex justify-between items-start mb-2">
                <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30 text-[10px] uppercase tracking-tighter px-2">
                  Nova Atualização
                </Badge>
                <button onClick={dismissAuto} className="text-zinc-400 hover:text-white transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
              
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-primary/20 border border-primary/30 shadow-inner">
                  <Megaphone className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h3 className="text-lg font-bold tracking-tight leading-tight">Operação Metas Integrada</h3>
                  <p className="text-xs text-zinc-400">Kanban → Pontuação Automática</p>
                </div>
              </div>
            </div>

            <div className="p-5 space-y-4 bg-card/50 backdrop-blur-xl">
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Agora cada card movido para <strong>Serviços Prontos</strong> no Kanban pontua automaticamente em <span className="text-primary font-medium">Operação Metas</span>.
                </p>

                <div className="space-y-2">
                  <div className="flex items-start gap-3 p-3 rounded-xl bg-muted/50 border border-border/50">
                    <div className="mt-0.5 rounded-full bg-green-500/10 p-1">
                      <CheckCircle2 className="w-4 h-4 text-green-500" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-semibold text-foreground">Pontuação automática</p>
                      <p className="text-[11px] text-muted-foreground leading-snug">
                        Cada produto vale <strong>1 ponto</strong> × multiplicador do evento configurado.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-3 rounded-xl bg-muted/50 border border-border/50">
                    <div className="mt-0.5 rounded-full bg-green-500/10 p-1">
                      <CheckCircle2 className="w-4 h-4 text-green-500" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-semibold text-foreground">Nova aba Operação Metas</p>
                      <p className="text-[11px] text-muted-foreground leading-snug">
                        Acompanhe a produção em tempo real: <strong>Diária, Mensal, Produtores, Conquistas, Tendências</strong> e mais.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-3 rounded-xl bg-muted/50 border border-border/50">
                    <div className="mt-0.5 rounded-full bg-green-500/10 p-1">
                      <CheckCircle2 className="w-4 h-4 text-green-500" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-semibold text-foreground">Integração Trello + Configurações</p>
                      <p className="text-[11px] text-muted-foreground leading-snug">
                        Nova tela <span className="text-primary font-medium">Operação Metas → Configurações</span> para mapear listas, membros e multiplicadores.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <Button 
                onClick={dismissAuto}
                className="w-full group/btn bg-primary hover:bg-primary/90 text-primary-foreground font-bold h-11 rounded-xl shadow-lg shadow-primary/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
              >
                Entendido
                <ChevronRight className="w-4 h-4 ml-2 group-hover/btn:translate-x-1 transition-transform" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
