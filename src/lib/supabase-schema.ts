type PostgrestLikeError = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
};

export function isMissingVideoDurationBreakdownColumnError(error: unknown): boolean {
  const err = error as PostgrestLikeError | null | undefined;
  const message = String(err?.message ?? "");
  const details = String(err?.details ?? "");
  const hint = String(err?.hint ?? "");
  const haystack = `${message} ${details} ${hint}`.toLowerCase();

  return err?.code === "42703" && haystack.includes("video_duration_breakdown_seconds");
}
