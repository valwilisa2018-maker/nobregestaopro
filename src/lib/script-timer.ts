// Cálculos do Medidor de Roteiro (100% no navegador, sem dependência de backend).

export type SpeechPace = "slow" | "normal" | "fast";

export const PACE_WPM: Record<SpeechPace, number> = {
  slow: 110,
  normal: 140,
  fast: 170,
};

export const PACE_LABEL: Record<SpeechPace, string> = {
  slow: "Lenta",
  normal: "Normal",
  fast: "Rápida",
};

export const TARGET_PRESETS = [
  { label: "15 segundos", seconds: 15 },
  { label: "30 segundos", seconds: 30 },
  { label: "45 segundos", seconds: 45 },
  { label: "1 minuto", seconds: 60 },
  { label: "1 min e 30 s", seconds: 90 },
  { label: "2 minutos", seconds: 120 },
  { label: "3 minutos", seconds: 180 },
  { label: "5 minutos", seconds: 300 },
];

export const REFERENCE_TABLE = [
  { label: "15 segundos", words: "30 a 40 palavras" },
  { label: "30 segundos", words: "60 a 75 palavras" },
  { label: "45 segundos", words: "90 a 110 palavras" },
  { label: "1 minuto", words: "130 a 150 palavras" },
  { label: "1 min e 30 s", words: "195 a 225 palavras" },
  { label: "2 minutos", words: "260 a 300 palavras" },
  { label: "3 minutos", words: "390 a 450 palavras" },
];

export function countWords(text: string): number {
  const t = text.trim();
  if (!t) return 0;
  return t.split(/\s+/).filter(Boolean).length;
}

export function countSentences(text: string): number {
  const t = text.trim();
  if (!t) return 0;
  return t.split(/[.!?…]+/).filter((s) => s.trim().length > 0).length;
}

/** Segundos estimados de narração para a quantidade de palavras. */
export function estimateSeconds(words: number, pace: SpeechPace): number {
  return Math.round((words / PACE_WPM[pace]) * 60);
}

/** "00:32" */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const m = Math.floor(s / 60);
  const rest = s % 60;
  return `${String(m).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

export function humanDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  if (s < 60) return `${s} segundos`;
  const m = Math.floor(s / 60);
  const rest = s % 60;
  if (rest === 0) return m === 1 ? "1 minuto" : `${m} minutos`;
  return `${m} ${m === 1 ? "minuto" : "minutos"} e ${rest} segundos`;
}

/** Classificação aproximada do vídeo. */
export function classifyDuration(seconds: number): string {
  if (seconds === 0) return "Sem roteiro ainda";
  const buckets = [15, 30, 45, 60, 90, 120, 180, 300];
  let closest = buckets[0];
  for (const b of buckets) {
    if (Math.abs(b - seconds) < Math.abs(closest - seconds)) closest = b;
  }
  if (seconds > 330) return `Aproximadamente ${Math.round(seconds / 60)} minutos`;
  return `Aproximadamente ${humanDuration(closest)}`;
}

export type ScriptAnalysis = {
  words: number;
  characters: number;
  charactersNoSpaces: number;
  sentences: number;
  seconds: number;
  clock: string;
  classification: string;
  targetSeconds: number;
  diffSeconds: number;
  percent: number;
  status: "empty" | "ideal" | "short" | "long";
  statusTitle: string;
  message: string;
  suggestion: string;
  wordsDelta: number;
};

/** Tolerância: até 10% (mínimo 2s) de diferença conta como tamanho ideal. */
export function analyzeScript(
  text: string,
  pace: SpeechPace,
  targetSeconds: number,
): ScriptAnalysis {
  const words = countWords(text);
  const characters = text.length;
  const charactersNoSpaces = text.replace(/\s/g, "").length;
  const sentences = countSentences(text);
  const seconds = estimateSeconds(words, pace);
  const diffSeconds = seconds - targetSeconds;
  const percent = targetSeconds > 0 ? Math.round((seconds / targetSeconds) * 100) : 0;
  const tolerance = Math.max(2, Math.round(targetSeconds * 0.1));
  const wpm = PACE_WPM[pace];
  const wordsDelta = Math.round((Math.abs(diffSeconds) / 60) * wpm);

  let status: ScriptAnalysis["status"] = "ideal";
  let statusTitle = "Roteiro no tamanho ideal";
  let message = `Seu roteiro está bem próximo da duração desejada de ${humanDuration(targetSeconds)}.`;
  let suggestion = "Nenhum ajuste necessário. Pode gravar!";

  if (words === 0) {
    status = "empty";
    statusTitle = "Aguardando o roteiro";
    message = "Cole ou escreva o roteiro para ver a duração estimada.";
    suggestion = `Para ${humanDuration(targetSeconds)} você precisa de aproximadamente ${Math.round((targetSeconds / 60) * wpm)} palavras.`;
  } else if (diffSeconds > tolerance) {
    status = "long";
    statusTitle = "Roteiro acima da duração desejada";
    message = `Seu roteiro está aproximadamente ${diffSeconds} segundos acima da duração desejada.`;
    suggestion = `Para chegar próximo de ${humanDuration(targetSeconds)}, reduza aproximadamente ${wordsDelta} palavras.`;
  } else if (diffSeconds < -tolerance) {
    status = "short";
    statusTitle = "Roteiro abaixo da duração desejada";
    message = `Seu roteiro está aproximadamente ${Math.abs(diffSeconds)} segundos abaixo da duração desejada.`;
    suggestion = `Você ainda pode adicionar aproximadamente ${wordsDelta} palavras.`;
  } else if (diffSeconds !== 0) {
    statusTitle =
      diffSeconds > 0
        ? "Roteiro ligeiramente acima da duração desejada"
        : "Roteiro ligeiramente abaixo da duração desejada";
    message = `Diferença de aproximadamente ${Math.abs(diffSeconds)} segundos — ainda dentro do tamanho ideal.`;
    suggestion =
      diffSeconds > 0
        ? `Se quiser ficar exato, remova aproximadamente ${Math.max(1, wordsDelta)} palavras.`
        : `Se quiser ficar exato, adicione aproximadamente ${Math.max(1, wordsDelta)} palavras.`;
  }

  return {
    words,
    characters,
    charactersNoSpaces,
    sentences,
    seconds,
    clock: formatClock(seconds),
    classification: classifyDuration(seconds),
    targetSeconds,
    diffSeconds,
    percent,
    status,
    statusTitle,
    message,
    suggestion,
    wordsDelta,
  };
}

export function buildResultText(a: ScriptAnalysis, pace: SpeechPace): string {
  return [
    "MEDIDOR DE ROTEIRO",
    `Palavras: ${a.words}`,
    `Caracteres: ${a.characters}`,
    `Frases: ${a.sentences}`,
    `Velocidade de fala: ${PACE_LABEL[pace]} (${PACE_WPM[pace]} palavras/min)`,
    `Tempo estimado: ${a.clock}`,
    `Meta: ${formatClock(a.targetSeconds)}`,
    `Diferença: ${a.diffSeconds >= 0 ? "+" : "-"}${formatClock(Math.abs(a.diffSeconds))}`,
    `Status: ${a.statusTitle}`,
    `Sugestão: ${a.suggestion}`,
  ].join("\n");
}
