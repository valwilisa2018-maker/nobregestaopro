import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCopy,
  Clock,
  Copy,
  Gauge,
  Hourglass,
  Sparkles,
  Timer,
  Trash2,
  TrendingDown,
  Type,
} from "lucide-react";
import { PageHero } from "@/components/page-hero";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/lib/toast";
import {
  PACE_LABEL,
  PACE_WPM,
  REFERENCE_TABLE,
  TARGET_PRESETS,
  analyzeScript,
  buildResultText,
  formatClock,
  humanDuration,
  type SpeechPace,
} from "@/lib/script-timer";

const STORAGE_KEY = "medidor-roteiro:v1";

export const Route = createFileRoute("/_authenticated/medidor-roteiro")({
  head: () => ({
    meta: [
      { title: "Medidor de Roteiro — Nobre MKT" },
      {
        name: "description",
        content:
          "Calcule automaticamente a duração aproximada da narração do seu roteiro, com meta de duração e sugestões de ajuste.",
      },
      { property: "og:title", content: "Medidor de Roteiro — Nobre MKT" },
      {
        property: "og:description",
        content: "Descubra quanto tempo o seu roteiro terá quando for narrado no vídeo.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: MedidorRoteiroPage,
});

function MedidorRoteiroPage() {
  const [text, setText] = useState("");
  const [pace, setPace] = useState<SpeechPace>("normal");
  const [target, setTarget] = useState(30);
  const [custom, setCustom] = useState(false);
  const [customValue, setCustomValue] = useState("30");
  const [loaded, setLoaded] = useState(false);

  // Recupera o último roteiro salvo no navegador.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as {
          text?: string;
          pace?: SpeechPace;
          target?: number;
          custom?: boolean;
        };
        if (typeof saved.text === "string") setText(saved.text);
        if (saved.pace && saved.pace in PACE_WPM) setPace(saved.pace);
        if (typeof saved.target === "number" && saved.target > 0) {
          setTarget(saved.target);
          setCustomValue(String(saved.target));
        }
        if (saved.custom) setCustom(true);
      }
    } catch {
      /* armazenamento indisponível — segue sem restaurar */
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ text, pace, target, custom }));
    } catch {
      /* ignora cota/modo privado */
    }
  }, [text, pace, target, custom, loaded]);

  const analysis = useMemo(() => analyzeScript(text, pace, target), [text, pace, target]);

  const statusStyles: Record<typeof analysis.status, string> = {
    empty: "border-border/60 bg-muted/40 text-muted-foreground",
    ideal: "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    short: "border-sky-500/40 bg-sky-500/10 text-sky-600 dark:text-sky-400",
    long: "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  };
  const StatusIcon =
    analysis.status === "ideal"
      ? CheckCircle2
      : analysis.status === "long"
        ? AlertTriangle
        : analysis.status === "short"
          ? TrendingDown
          : Hourglass;

  const copy = async (value: string, ok: string) => {
    if (!value.trim()) {
      toast.warning("Não há nada para copiar ainda.");
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
      toast.success(ok);
    } catch {
      toast.error("Não foi possível copiar. Copie manualmente com Ctrl+C.");
    }
  };

  const applyCustom = (value: string) => {
    setCustomValue(value);
    const seconds = Math.round(Number(value));
    if (Number.isFinite(seconds) && seconds > 0) setTarget(seconds);
  };

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow="Produção"
        icon={Timer}
        title="Medidor de Roteiro"
        description="Cole seu roteiro abaixo e descubra aproximadamente quanto tempo ele terá no vídeo."
        actions={
          <Badge variant="outline" className="gap-1.5 py-1.5">
            <Gauge className="h-3.5 w-3.5" />
            {PACE_LABEL[pace]} · {PACE_WPM[pace]} palavras/min
          </Badge>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        {/* Editor */}
        <div className="space-y-6">
          <Card className="border-border/60 bg-card/70 backdrop-blur">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Type className="h-4 w-4 text-primary" />
                Cole seu roteiro aqui
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Cole seu roteiro aqui ou comece a escrever..."
                aria-label="Área do roteiro"
                className="min-h-[280px] resize-y text-base leading-relaxed sm:min-h-[360px]"
              />
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <MiniStat label="Palavras" value={String(analysis.words)} />
                <MiniStat label="Caracteres" value={String(analysis.characters)} />
                <MiniStat label="Frases" value={String(analysis.sentences)} />
                <MiniStat label="Tempo" value={analysis.clock} />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setText("");
                    toast.success("Roteiro limpo.");
                  }}
                >
                  <Trash2 className="mr-2 h-4 w-4" /> Limpar roteiro
                </Button>
                <Button variant="outline" onClick={() => copy(text, "Roteiro copiado!")}>
                  <Copy className="mr-2 h-4 w-4" /> Copiar roteiro
                </Button>
                <Button
                  variant="outline"
                  onClick={() => copy(buildResultText(analysis, pace), "Resultado copiado!")}
                >
                  <ClipboardCopy className="mr-2 h-4 w-4" /> Copiar resultado
                </Button>
                <Button
                  variant="secondary"
                  disabled
                  title="Recurso futuro: ajuste automático com inteligência artificial"
                >
                  <Sparkles className="mr-2 h-4 w-4" /> Ajustar para a duração (em breve)
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Velocidade e meta */}
          <Card className="border-border/60 bg-card/70 backdrop-blur">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Velocidade e duração desejada</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Velocidade da fala
                </p>
                <div className="flex flex-wrap gap-2">
                  {(Object.keys(PACE_WPM) as SpeechPace[]).map((p) => (
                    <Button
                      key={p}
                      size="sm"
                      variant={pace === p ? "default" : "outline"}
                      aria-pressed={pace === p}
                      onClick={() => setPace(p)}
                    >
                      {PACE_LABEL[p]}
                      <span className="ml-1.5 text-[11px] opacity-70">{PACE_WPM[p]} ppm</span>
                    </Button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Qual a duração desejada?
                </p>
                <div className="flex flex-wrap gap-2">
                  {TARGET_PRESETS.map((preset) => (
                    <Button
                      key={preset.seconds}
                      size="sm"
                      variant={!custom && target === preset.seconds ? "default" : "outline"}
                      aria-pressed={!custom && target === preset.seconds}
                      onClick={() => {
                        setCustom(false);
                        setTarget(preset.seconds);
                        setCustomValue(String(preset.seconds));
                      }}
                    >
                      {preset.label}
                    </Button>
                  ))}
                  <Button
                    size="sm"
                    variant={custom ? "default" : "outline"}
                    aria-pressed={custom}
                    onClick={() => setCustom(true)}
                  >
                    Personalizado
                  </Button>
                </div>
                {custom && (
                  <div className="flex items-center gap-2 pt-1">
                    <Input
                      type="number"
                      min={1}
                      value={customValue}
                      onChange={(e) => applyCustom(e.target.value)}
                      aria-label="Duração desejada em segundos"
                      className="w-32"
                    />
                    <span className="text-sm text-muted-foreground">segundos</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Resultado */}
        <div className="space-y-6">
          <Card className="relative overflow-hidden border-primary/30 bg-gradient-to-br from-primary/10 via-card to-card">
            <div className="pointer-events-none absolute -top-20 -right-20 h-56 w-56 rounded-full bg-primary/20 blur-3xl" />
            <CardContent className="relative space-y-3 p-6 text-center sm:p-8">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Tempo estimado
              </p>
              <p className="text-6xl font-bold tabular-nums tracking-tight sm:text-7xl">
                {analysis.clock}
              </p>
              <p className="text-sm text-muted-foreground">
                {analysis.words === 0
                  ? "Escreva ou cole o roteiro para calcular a narração."
                  : `Este roteiro possui aproximadamente ${humanDuration(analysis.seconds)} de narração.`}
              </p>
              <Badge variant="secondary" className="gap-1.5">
                <Clock className="h-3.5 w-3.5" />
                {analysis.classification}
              </Badge>
            </CardContent>
          </Card>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <BigStat label="Palavras" value={`${analysis.words}`} hint={`${analysis.characters} caracteres`} />
            <BigStat label="Meta" value={formatClock(analysis.targetSeconds)} hint={humanDuration(analysis.targetSeconds)} />
            <BigStat
              label="Diferença"
              value={`${analysis.diffSeconds >= 0 ? "+" : "−"}${Math.abs(analysis.diffSeconds)}s`}
              hint={`${analysis.percent}% da meta`}
            />
          </div>

          <Card className="border-border/60 bg-card/70 backdrop-blur">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Tamanho em relação à meta</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Progress value={Math.min(100, analysis.percent)} aria-label="Progresso em relação à meta" />
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
                <span>Duração atual: {analysis.clock}</span>
                <span>Meta: {formatClock(analysis.targetSeconds)}</span>
                <span className="font-semibold text-foreground tabular-nums">
                  {analysis.percent}% da duração desejada
                </span>
              </div>
              <div className={`flex gap-3 rounded-xl border p-4 ${statusStyles[analysis.status]}`}>
                <StatusIcon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
                <div className="space-y-1 text-sm">
                  <p className="font-semibold">{analysis.statusTitle}</p>
                  <p className="opacity-90">{analysis.message}</p>
                  <p className="opacity-90">
                    <span className="font-medium">Sugestão: </span>
                    {analysis.suggestion}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/60 bg-card/70 backdrop-blur">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Referência rápida</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Duração</TableHead>
                    <TableHead className="text-right">Palavras</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {REFERENCE_TABLE.map((row) => (
                    <TableRow key={row.label}>
                      <TableCell className="font-medium">{row.label}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{row.words}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <p className="pt-3 text-xs text-muted-foreground">
                Valores apenas de referência — o cálculo principal usa a velocidade de fala
                selecionada ({PACE_WPM[pace]} palavras por minuto).
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-background/60 px-3 py-2 text-center">
      <p className="text-lg font-bold tabular-nums leading-tight">{value}</p>
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>
    </div>
  );
}

function BigStat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <Card className="border-border/60 bg-card/70 backdrop-blur">
      <CardContent className="space-y-1 p-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          {label}
        </p>
        <p className="text-2xl font-bold tabular-nums tracking-tight">{value}</p>
        <p className="truncate text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}
