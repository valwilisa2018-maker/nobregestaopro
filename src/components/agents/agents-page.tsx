import { useState } from "react";
import { Bot, ScrollText, Smartphone } from "lucide-react";
import { PageShell } from "@/components/page-shell";
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
    <PageShell
      title="Agentes de IA"
      description="Gerencie agentes, provedores e chaves de API"
      icon={<Bot className="h-6 w-6" />}
      status="ativo"
    >
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 rounded-2xl border border-border/60 bg-card/40 p-2">
        {TABS.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`relative h-14 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2 ${
                active
                  ? "text-primary-foreground ring-1 ring-primary/60"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              style={active ? { background: "var(--gradient-primary)", boxShadow: "var(--shadow-elegant)" } : undefined}
            >
              <t.icon className="h-4 w-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      <div className="mt-6">
        {tab === "agents" && <TabAgents />}
        {tab === "logs" && <TabLogs />}
        {tab === "providers" && <TabProviders />}
      </div>
    </PageShell>
  );
}