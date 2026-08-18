import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { SafeSelect } from "@/components/safe-select";
import { formatVideoDuration } from "@/lib/format";
import { calculateVideoPoints, sumVideoDurations } from "@/lib/video-production";

const VIDEO_DURATION_OPTIONS: { value: number; label: string }[] = Array.from(
  { length: 20 },
  (_, i) => {
    const sec = (i + 1) * 30;
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    const label = m === 0 ? `${s}s` : s === 0 ? `${m}min` : `${m}min${s}s`;
    return { value: sec, label };
  },
);

export interface VideoDurationBreakdownFieldProps {
  quantity: number;
  durations: string[];
  applyAllValue: string;
  onDurationChange: (index: number, value: string) => void;
  onApplyAllValueChange: (value: string) => void;
  onApplyAll: () => void;
}

export function VideoDurationBreakdownField({
  quantity,
  durations,
  applyAllValue,
  onDurationChange,
  onApplyAllValueChange,
  onApplyAll,
}: VideoDurationBreakdownFieldProps) {
  const normalizedQuantity = Math.max(1, Number(quantity || 1));
  const numericDurations = durations.map((duration) => Number(duration || 0));
  const totalSeconds = sumVideoDurations(numericDurations);
  const totalPoints = calculateVideoPoints(totalSeconds);

  return (
    <div className="rounded-xl border border-amber-300/70 bg-amber-50/70 p-3 dark:bg-amber-950/20">
      <div className="space-y-1">
        <Label>Duracao dos videos *</Label>
        <p className="text-[11px] text-amber-700 dark:text-amber-300">
          Cada video guarda sua propria duracao. O total do pacote e calculado pela soma.
        </p>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <div className="rounded-lg border border-amber-200 bg-white/80 px-3 py-2 text-xs dark:border-amber-400/20 dark:bg-black/10">
          <div className="text-muted-foreground">Quantidade</div>
          <div className="mt-1 text-sm font-semibold">{normalizedQuantity} video(s)</div>
        </div>
        <div className="rounded-lg border border-amber-200 bg-white/80 px-3 py-2 text-xs dark:border-amber-400/20 dark:bg-black/10">
          <div className="text-muted-foreground">Minutagem total</div>
          <div className="mt-1 text-sm font-semibold">
            {totalSeconds > 0 ? formatVideoDuration(totalSeconds) : "Selecione"}
          </div>
        </div>
        <div className="rounded-lg border border-amber-200 bg-white/80 px-3 py-2 text-xs dark:border-amber-400/20 dark:bg-black/10">
          <div className="text-muted-foreground">Pontos totais</div>
          <div className="mt-1 text-sm font-semibold">{totalPoints || 0} pts</div>
        </div>
      </div>

      {normalizedQuantity > 1 && (
        <div className="mt-3 rounded-lg border border-dashed border-amber-300/80 bg-white/70 p-3 dark:border-amber-400/20 dark:bg-black/10">
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <div>
              <Label className="text-[11px]">Aplicar esta duracao a todos</Label>
              <div className="mt-1.5">
                <SafeSelect
                  ariaLabel="Aplicar duracao a todos"
                  placeholder="Selecione uma duracao"
                  value={applyAllValue || ""}
                  onValueChange={onApplyAllValueChange}
                  options={VIDEO_DURATION_OPTIONS.map((option) => ({
                    value: String(option.value),
                    label: option.label,
                  }))}
                />
              </div>
            </div>
            <Button type="button" variant="outline" onClick={onApplyAll} className="sm:self-end">
              Aplicar aos {normalizedQuantity} videos
            </Button>
          </div>
        </div>
      )}

      <div className="mt-3 space-y-2">
        {Array.from({ length: normalizedQuantity }, (_, index) => (
          <div
            key={`video-duration-${index + 1}`}
            className="grid gap-2 rounded-lg border border-amber-200/80 bg-white/75 p-3 dark:border-amber-400/15 dark:bg-black/10 sm:grid-cols-[120px_minmax(0,1fr)] sm:items-center"
          >
            <div className="text-sm font-medium">Video {index + 1}</div>
            <SafeSelect
              ariaLabel={`Duracao do video ${index + 1}`}
              placeholder="Selecione (min. 30s)"
              value={durations[index] || ""}
              onValueChange={(value) => onDurationChange(index, value)}
              options={VIDEO_DURATION_OPTIONS.map((option) => ({
                value: String(option.value),
                label: option.label,
              }))}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
