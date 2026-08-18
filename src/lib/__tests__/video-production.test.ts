import { describe, expect, it } from "vitest";
import {
  calculateVideoPoints,
  parseDuracaoSegundos,
  resolveProductionDeliveredAt,
  resolveVideoDurationSeconds,
  resolveOrderVideoDurationSeconds,
  sumVideoDurations,
} from "../video-production";

const totalSegundos = (durations: number[]) => durations.reduce((acc, duration) => acc + duration, 0);
const totalPontos = (durations: number[]) => calculateVideoPoints(totalSegundos(durations));

describe("video-production", () => {
  it("soma somente a minutagem individual registrada no card", () => {
    expect(resolveVideoDurationSeconds(90, 120)).toBe(90);
    expect(resolveVideoDurationSeconds(null, 120)).toBe(0);
    expect(resolveVideoDurationSeconds(0, 120)).toBe(0);
    expect(resolveVideoDurationSeconds(null, null)).toBe(0);
  });

  it("conta como produzido o card legado que já está concluído no Kanban", () => {
    expect(
      resolveProductionDeliveredAt(
        "outro-produtor",
        "Vídeo 46",
        null,
        "2026-08-18T15:30:00-03:00",
        true,
      ),
    ).toBe("2026-08-18T15:30:00-03:00");
    expect(
      resolveProductionDeliveredAt(
        "outro-produtor",
        "Vídeo em produção",
        null,
        "2026-08-18T15:30:00-03:00",
        false,
      ),
    ).toBeNull();
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
    { label: "10 videos de 30s", durations: [30, 30, 30, 30, 30, 30, 30, 30, 30, 30], videos: 10, segundos: 300, pontos: 10 },
    { label: "5 videos de 60s", durations: [60, 60, 60, 60, 60], videos: 5, segundos: 300, pontos: 10 },
    { label: "4 videos: 30s + 60s + 30s + 90s", durations: [30, 60, 30, 90], videos: 4, segundos: 210, pontos: 7 },
    { label: "2 videos de 30s", durations: [30, 30], videos: 2, segundos: 60, pontos: 2 },
    { label: "3 videos de 30s", durations: [30, 30, 30], videos: 3, segundos: 90, pontos: 3 },
    { label: "3 videos: 30s + 30s + 60s", durations: [30, 30, 60], videos: 3, segundos: 120, pontos: 4 },
    { label: "3 videos: 60s + 60s + 60s", durations: [60, 60, 60], videos: 3, segundos: 180, pontos: 6 },
  ])("$label", ({ durations, videos, segundos, pontos }) => {
    expect(durations).toHaveLength(videos);
    expect(totalSegundos(durations)).toBe(segundos);
    expect(totalPontos(durations)).toBe(pontos);
  });

  it("resolve a duracao individual pelo breakdown da venda sem multiplicar o total do pacote", () => {
    const sale = {
      service_quantity: 4,
      video_duration_seconds: 210,
      video_duration_breakdown_seconds: [30, 60, 30, 90],
    };

    expect(
      resolveOrderVideoDurationSeconds({
        service_index: 1,
        sales: sale,
      }),
    ).toBe(30);
    expect(
      resolveOrderVideoDurationSeconds({
        service_index: 4,
        sales: sale,
      }),
    ).toBe(90);
    expect(sumVideoDurations(sale.video_duration_breakdown_seconds)).toBe(210);
    expect(calculateVideoPoints(sumVideoDurations(sale.video_duration_breakdown_seconds))).toBe(7);
  });

  it("nao cai para a duracao total da venda quando o pacote antigo nao tem breakdown", () => {
    expect(
      resolveOrderVideoDurationSeconds({
        service_index: 2,
        title: "Video 02",
        sales: {
          service_quantity: 10,
          video_duration_seconds: 300,
          video_duration_breakdown_seconds: null,
        },
      }),
    ).toBe(0);
  });

  it("permite editar so um card e recalcular o total do pacote pela soma real", () => {
    const before = [30, 30, 30, 90];
    const after = [30, 60, 30, 90];

    expect(sumVideoDurations(before)).toBe(180);
    expect(calculateVideoPoints(sumVideoDurations(before))).toBe(6);
    expect(sumVideoDurations(after)).toBe(210);
    expect(calculateVideoPoints(sumVideoDurations(after))).toBe(7);
  });
});
