import { useEffect, useState } from "react";
import { Save, MessageCircle, Cable } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";

type WaProvider = "meta" | "evolution";
const KEY = "wa_provider";

export function TabProviders() {
  const { user } = useAuth();
  const [choice, setChoice] = useState<WaProvider>("evolution");
  const storageKey = user?.id ? `${KEY}.${user.id}` : KEY;

  useEffect(() => {
    const v = localStorage.getItem(storageKey) as WaProvider | null;
    if (v) setChoice(v);
  }, [storageKey]);

  function save() {
    localStorage.setItem(storageKey, choice);
    toast.success("Provedor salvo");
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold">Provedor WhatsApp</h2>
        <p className="text-sm text-muted-foreground">Escolha qual provedor o agente usará para enviar/receber mensagens</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card
          selected={choice === "meta"}
          onClick={() => setChoice("meta")}
          icon={<MessageCircle className="h-5 w-5" />}
          title="API Oficial Meta"
          description="WhatsApp Business API oficial. Requer aprovação, janela de 24h para mensagens."
        />
        <Card
          selected={choice === "evolution"}
          onClick={() => setChoice("evolution")}
          icon={<Cable className="h-5 w-5" />}
          title="Evolution API"
          description="Conexão via Evolution API. Auto-hospedado, múltiplas instâncias e QR Code."
        />
      </div>

      <Button onClick={save} className="rounded-xl" style={{ background: "var(--gradient-primary)", boxShadow: "var(--shadow-elegant)" }}>
        <Save className="h-4 w-4" /> Salvar Provedor
      </Button>
    </div>
  );
}

function Card({ selected, onClick, icon, title, description }: { selected: boolean; onClick: () => void; icon: React.ReactNode; title: string; description: string }) {
  return (
    <button
      onClick={onClick}
      className={`text-left rounded-2xl border p-5 space-y-2 transition-all ${
        selected ? "border-primary bg-primary/5 ring-1 ring-primary/40" : "border-border/60 bg-card/40 hover:border-primary/40"
      }`}
    >
      <div className="flex items-center gap-3">
        <div className={`grid h-10 w-10 place-items-center rounded-xl ${selected ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"}`}>{icon}</div>
        <h3 className="font-semibold">{title}</h3>
      </div>
      <p className="text-sm text-muted-foreground">{description}</p>
    </button>
  );
}