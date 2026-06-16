import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/evolution-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const payload = await request.json().catch(() => null);
          console.log("[evolution-webhook]", {
            event: payload?.event,
            instance: payload?.instance,
            at: new Date().toISOString(),
          });
        } catch (e) {
          console.error("[evolution-webhook] parse error", e);
        }
        return new Response("ok", { status: 200 });
      },
      GET: async () => Response.json({ ok: true }),
    },
  },
});