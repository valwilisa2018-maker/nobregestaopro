import { createFileRoute } from "@tanstack/react-router";
import { PageHero } from "@/components/page-hero";
import { useEffect, useRef, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  Settings, Upload, Palette, Save, RotateCcw, Loader2,
  Sun, Moon, Minus, Briefcase, ImageIcon,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/white-label")({
  head: () => ({
    meta: [
      { title: "Personalização Visual — Gestão Nobre MKT" },
      { name: "description", content: "Personalize logo, cores e temas da plataforma (white-label)." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: WhiteLabelPage,
});

type Settings = {
  logo: string | null;
  primary: string;
  secondary: string;
  background: string;
  foreground: string;
};

const DEFAULTS: Settings = {
  logo: null,
  primary: "#8b5cf6",
  secondary: "#f1f5f9",
  background: "#ffffff",
  foreground: "#0f172a",
};

const PRESETS: Record<string, Omit<Settings, "logo">> = {
  Claro:        { primary: "#8b5cf6", secondary: "#f1f5f9", background: "#ffffff", foreground: "#0f172a" },
  Escuro:       { primary: "#a78bfa", secondary: "#1e293b", background: "#0b0f19", foreground: "#f8fafc" },
  Minimalista:  { primary: "#111827", secondary: "#f5f5f5", background: "#fafafa", foreground: "#111827" },
  Profissional: { primary: "#1d4ed8", secondary: "#e2e8f0", background: "#f8fafc", foreground: "#0f172a" },
};

const STORAGE_KEY = "wl:settings:v1";

function applyToRoot(s: Settings) {
  const r = document.documentElement.style;
  r.setProperty("--color-primary", s.primary);
  r.setProperty("--color-secondary", s.secondary);
  r.setProperty("--color-background", s.background);
  r.setProperty("--color-foreground", s.foreground);
  if (s.logo) r.setProperty("--wl-logo", `url(${s.logo})`);
}

function clearFromRoot() {
  const r = document.documentElement.style;
  ["--color-primary", "--color-secondary", "--color-background", "--color-foreground", "--wl-logo"].forEach(
    (k) => r.removeProperty(k),
  );
}

function WhiteLabelPage() {
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [saving, setSaving] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = { ...DEFAULTS, ...JSON.parse(raw) } as Settings;
        setSettings(parsed);
        applyToRoot(parsed);
      }
    } catch {}
  }, []);

  // Live preview
  useEffect(() => { applyToRoot(settings); }, [settings]);

  const update = <K extends keyof Settings>(k: K, v: Settings[K]) =>
    setSettings((s) => ({ ...s, [k]: v }));

  const handleFile = useCallback((file: File) => {
    if (!/image\/(png|svg\+xml|jpeg|webp)/.test(file.type)) {
      toast.error("Envie um arquivo PNG, SVG, JPG ou WEBP");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Arquivo muito grande (máx 2MB)");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => update("logo", reader.result as string);
    reader.readAsDataURL(file);
  }, []);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  };

  const applyPreset = (name: keyof typeof PRESETS) => {
    setSettings((s) => ({ ...s, ...PRESETS[name] }));
    toast.success(`Tema "${name}" aplicado`);
  };

  const save = async () => {
    setSaving(true);
    await new Promise((r) => setTimeout(r, 500));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    setSaving(false);
    toast.success("Configurações salvas com sucesso");
  };

  const restore = () => {
    setSettings(DEFAULTS);
    localStorage.removeItem(STORAGE_KEY);
    clearFromRoot();
    toast.success("Padrão restaurado");
  };

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
      <PageHero
        eyebrow="Aparência"
        icon={Settings}
        title="Personalização Visual"
        description="Ajuste logo, cores e tema. Alterações aparecem em tempo real."
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_420px]">
        {/* CONTROLES */}
        <div className="space-y-6">
          {/* Logo */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Upload className="w-4 h-4" /> Upload de Logo</CardTitle>
              <CardDescription>Arraste um PNG ou SVG (máx 2MB).</CardDescription>
            </CardHeader>
            <CardContent>
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
                onClick={() => fileRef.current?.click()}
                className={`cursor-pointer rounded-xl border-2 border-dashed p-8 text-center transition-all duration-300 ${
                  dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/40"
                }`}
              >
                {settings.logo ? (
                  <div className="flex flex-col items-center gap-3">
                    <img src={settings.logo} alt="Logo preview" className="max-h-20 object-contain" />
                    <span className="text-xs text-muted-foreground">Clique ou arraste para trocar</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <ImageIcon className="w-8 h-8" />
                    <span className="text-sm">Arraste seu logo aqui ou clique para escolher</span>
                    <span className="text-xs">PNG · SVG · JPG · WEBP</span>
                  </div>
                )}
                <input
                  ref={fileRef} type="file" accept="image/png,image/svg+xml,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
                />
              </div>
              {settings.logo && (
                <Button variant="ghost" size="sm" className="mt-3" onClick={(e) => { e.stopPropagation(); update("logo", null); }}>
                  Remover logo
                </Button>
              )}
            </CardContent>
          </Card>

          {/* Cores */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Palette className="w-4 h-4" /> Paleta de Cores</CardTitle>
              <CardDescription>Escolha as cores da sua marca.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              {([
                ["primary", "Cor Primária"],
                ["secondary", "Cor Secundária"],
                ["background", "Cor de Fundo"],
                ["foreground", "Cor do Texto"],
              ] as const).map(([key, label]) => (
                <div key={key} className="space-y-2">
                  <Label htmlFor={key}>{label}</Label>
                  <div className="flex items-center gap-2">
                    <input
                      id={key} type="color" value={settings[key] as string}
                      onChange={(e) => update(key, e.target.value)}
                      className="h-10 w-14 cursor-pointer rounded-md border border-border bg-transparent p-1"
                    />
                    <Input
                      value={settings[key] as string}
                      onChange={(e) => update(key, e.target.value)}
                      className="font-mono text-sm"
                    />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Presets */}
          <Card>
            <CardHeader>
              <CardTitle>Temas Predefinidos</CardTitle>
              <CardDescription>Aplique um estilo pronto com um clique.</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { name: "Claro" as const, Icon: Sun },
                { name: "Escuro" as const, Icon: Moon },
                { name: "Minimalista" as const, Icon: Minus },
                { name: "Profissional" as const, Icon: Briefcase },
              ].map(({ name, Icon }) => (
                <button
                  key={name}
                  onClick={() => applyPreset(name)}
                  className="group flex flex-col items-center gap-2 rounded-xl border border-border p-4 transition-all duration-300 hover:border-primary hover:shadow-sm hover:-translate-y-0.5"
                >
                  <div className="flex gap-1">
                    {[PRESETS[name].primary, PRESETS[name].secondary, PRESETS[name].background].map((c) => (
                      <span key={c} className="w-4 h-4 rounded-full border border-border" style={{ background: c }} />
                    ))}
                  </div>
                  <div className="flex items-center gap-1.5 text-sm font-medium">
                    <Icon className="w-3.5 h-3.5" /> {name}
                  </div>
                </button>
              ))}
            </CardContent>
          </Card>

          {/* Ações */}
          <div className="flex flex-wrap gap-3">
            <Button onClick={save} disabled={saving} className="gap-2">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Salvar Configurações
            </Button>
            <Button variant="outline" onClick={restore} className="gap-2">
              <RotateCcw className="w-4 h-4" /> Restaurar Padrão
            </Button>
          </div>
        </div>

        {/* PREVIEW */}
        <div className="lg:sticky lg:top-6 lg:self-start">
          <Card className="overflow-hidden">
            <CardHeader>
              <CardTitle className="text-sm uppercase tracking-widest text-muted-foreground">Preview</CardTitle>
            </CardHeader>
            <CardContent>
              <div
                className="rounded-xl border border-border overflow-hidden"
                style={{ background: settings.background, color: settings.foreground }}
              >
                <div
                  className="flex items-center justify-between px-4 py-3 border-b"
                  style={{ background: settings.secondary, borderColor: "rgba(0,0,0,0.08)" }}
                >
                  {settings.logo ? (
                    <img src={settings.logo} alt="Logo" className="h-7 object-contain" />
                  ) : (
                    <div className="text-sm font-bold tracking-tight" style={{ color: settings.foreground }}>
                      Sua Marca
                    </div>
                  )}
                  <span
                    className="text-xs font-medium px-2 py-1 rounded-md"
                    style={{ background: settings.primary, color: "#fff" }}
                  >
                    Ativo
                  </span>
                </div>
                <div className="p-5 space-y-4">
                  <div>
                    <div className="text-lg font-semibold">Bem-vindo de volta 👋</div>
                    <div className="text-sm opacity-70">Este é um preview da sua plataforma personalizada.</div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-lg p-3" style={{ background: settings.secondary }}>
                      <div className="text-xs opacity-70">Vendas</div>
                      <div className="text-xl font-bold" style={{ color: settings.primary }}>R$ 12.480</div>
                    </div>
                    <div className="rounded-lg p-3" style={{ background: settings.secondary }}>
                      <div className="text-xs opacity-70">Pedidos</div>
                      <div className="text-xl font-bold" style={{ color: settings.primary }}>128</div>
                    </div>
                  </div>
                  <button
                    className="w-full py-2.5 rounded-lg text-sm font-medium transition-opacity hover:opacity-90"
                    style={{ background: settings.primary, color: "#fff" }}
                  >
                    Ação Primária
                  </button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}