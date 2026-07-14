import { useState } from "react";
import { Bot, ScrollText, Smartphone, Sparkles, Zap } from "lucide-react";
import { TabAgents } from "./tab-agents";
import { TabLogs } from "./tab-logs";
import { TabProviders } from "./tab-providers";

type TabId = "agents" | "logs" | "providers";

const TABS: { id: TabId; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "agents", label: "Meus Agentes", icon: Bot },
  { id: "logs", label: "Logs", icon: ScrollText },
  { id: "providers", label: "Provedores", icon: Smartphone },
];

export function AgentsPage() {
  const [tab, setTab] = useState<TabId>("agents");

  return (
    <div className="space-y-6">
      {/* Premium Hero */}
      <div className="relative overflow-hidden rounded-3xl border border-violet-500/20 bg-gradient-to-br from-[hsl(240_40%_8%)] via-[hsl(258_45%_12%)] to-[hsl(270_50%_10%)] p-6 sm:p-8">
        {/* ambient glows */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-24 -left-16 h-72 w-72 rounded-full bg-violet-600/25 blur-3xl" />
          <div className="absolute -bottom-24 right-0 h-72 w-72 rounded-full bg-indigo-500/20 blur-3xl" />
          <div className="absolute top-1/2 left-1/2 h-40 w-40 -translate-x-1/2 -translate-y-1/2 rounded-full bg-fuchsia-500/10 blur-3xl" />
        </div>
        {/* subtle grid overlay */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.05]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,.6) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.6) 1px,transparent 1px)",
            backgroundSize: "32px 32px",
          }}
        />

        <div className="relative flex flex-wrap items-center justify-between gap-6">
          <div className="flex items-center gap-5 min-w-0">
            <div className="relative shrink-0">
              <div className="absolute inset-0 rounded-2xl bg-violet-500/40 blur-xl" />
              <div className="relative grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 via-violet-500 to-purple-600 ring-1 ring-white/20 shadow-[0_20px_60px_-10px_rgba(139,92,246,0.7)]">
                <Bot className="h-8 w-8 text-white" />
                <Sparkles className="absolute -top-1 -right-1 h-3.5 w-3.5 text-violet-200" />
              </div>
            </div>
            <div className="min-w-0 space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl sm:text-3xl font-black tracking-tight bg-gradient-to-r from-white via-violet-100 to-indigo-200 bg-clip-text text-transparent">
                  Agentes de IA
                </h1>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-300">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  </span>
                  Ativo
                </span>
              </div>
              <p className="text-sm text-violet-100/70 max-w-xl">
                Gerencie agentes, provedores e chaves de API com inteligência de ponta.
              </p>
            </div>
          </div>

          <div className="hidden md:flex items-center gap-3">
            <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur px-4 py-3">
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-violet-200/70">
                <Zap className="h-3 w-3" /> Motor IA
              </div>
              <div className="text-sm font-semibold text-white">Multi-Provider</div>
            </div>
          </div>
        </div>
      </div>

      {/* Premium tabs */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 rounded-2xl border border-violet-500/20 bg-gradient-to-br from-card/60 to-card/20 backdrop-blur p-2 shadow-[0_10px_40px_-20px_rgba(139,92,246,0.5)]">
        {TABS.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`relative h-14 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2 overflow-hidden ${
                active
                  ? "text-white ring-1 ring-violet-400/60 shadow-[0_10px_30px_-10px_rgba(139,92,246,0.8)]"
                  : "text-muted-foreground hover:text-foreground hover:bg-white/[0.03]"
              }`}
              style={
                active
                  ? { background: "linear-gradient(135deg,#6366f1 0%,#8b5cf6 50%,#a855f7 100%)" }
                  : undefined
              }
            >
              {active && (
                <span className="pointer-events-none absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full animate-[shimmer_2.5s_infinite]" />
              )}
              <t.icon className="h-4 w-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      <div>
        {tab === "agents" && <TabAgents />}
        {tab === "logs" && <TabLogs />}
        {tab === "providers" && <TabProviders />}
      </div>
    </div>
  );
}