export function buildEvolutionTextPayload(
  number: string,
  text: string,
  extra: Record<string, unknown> = {},
) {
  return {
    number,
    textMessage: { text },
    ...extra,
  };
}
