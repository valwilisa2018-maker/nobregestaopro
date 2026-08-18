import { describe, expect, it } from "vitest";
import {
  calculateVideoPoints,
  parseDuracaoSegundos,
  resolveVideoDurationSeconds,
} from "../video-production";

const totalSegundos = (durations: number[]) => durations.reduce((acc, duration) => acc + duration, 0);
const totalPontos = (durations: number[]) => calculateVideoPoints(totalSegundos(durations));

describe("video-production", () => {
  it("usa exatamente a mesma prioridade de minutagem do Kanban", () => {
    expect(resolveVideoDurationSeconds(90, 120)).toBe(90);
    expect(resolveVideoDurationSeconds(null, 120)).toBe(120);
    expect(resolveVideoDurationSeconds(0, 120)).toBe(0);
    expect(resolveVideoDurationSeconds(null, null)).toBe(0);
  });

  it("extrai duracoes comuns do titulo do card", () => {
    expect(parseDuracaoSegundos("Video 01 - 30s")).toBe(30);
    expect(parseDuracaoSegundos("Video 02 - 1min30s")).toBe(90);
    expect(parseDuracaoSegundos("Video 03 - 02:00")).toBe(120);
  });

  it.each([
    { label: "1 video de 30s", durations: [30], videos: 1, segundos: 30, pontos: 1 },
    { label: "1 video de 60s", durations: [60], videos: 1, segundos: 60, pontos: 2 },
    { label: "1 video de 90s", durations: [90], videos: 1, segundos: 90, pontos: 3 },
    { label: "2 videos de 30s", durations: [30, 30], videos: 2, segundos: 60, pontos: 2 },
    { label: "3 videos de 30s", durations: [30, 30, 30], videos: 3, segundos: 90, pontos: 3 },
    { label: "3 videos: 30s + 30s + 60s", durations: [30, 30, 60], videos: 3, segundos: 120, pontos: 4 },
    { label: "3 videos: 60s + 60s + 60s", durations: [60, 60, 60], videos: 3, segundos: 180, pontos: 6 },
  ])("$label", ({ durations, videos, segundos, pontos }) => {
    expect(durations).toHaveLength(videos);
    expect(totalSegundos(durations)).toBe(segundos);
    expect(totalPontos(durations)).toBe(pontos);
  });
});
