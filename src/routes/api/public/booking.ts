import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const Input = z.object({
  userId: z.string().uuid(),
  name: z.string().min(2).max(120),
  phone: z.string().min(6).max(30),
  email: z.string().email().optional().or(z.literal("")),
  when: z.string().min(4).max(200),
  notes: z.string().max(1000).optional().or(z.literal("")),
});

export const Route = createFileRoute("/api/public/booking")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const json = await request.json().catch(() => null);
        const parsed = Input.safeParse(json);
        if (!parsed.success) {
          return Response.json({ ok: false, error: "invalid_input" }, { status: 400 });
        }
        const { userId, name, phone, email, when, notes } = parsed.data;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // First stage for this user
        const { data: stage } = await supabaseAdmin
          .from("pipeline_stages")
          .select("id")
          .eq("user_id", userId)
          .order("position", { ascending: true })
          .limit(1)
          .maybeSingle();

        if (!stage) {
          return Response.json({ ok: false, error: "no_stages" }, { status: 400 });
        }

        const composedNotes = `📅 Agendamento solicitado: ${when}${notes ? `\n\n${notes}` : ""}`;
        const { error } = await supabaseAdmin.from("pipeline_deals").insert({
          user_id: userId,
          stage_id: stage.id,
          title: name,
          phone,
          whatsapp: phone,
          email: email || null,
          source: "agendamento",
          notes: composedNotes,
          priority: "high",
          value_cents: 0,
          links: {},
          checklist: [],
          tags: ["agendamento"],
          next_contact_at: new Date().toISOString(),
        } as never);

        if (error) {
          return Response.json({ ok: false, error: error.message }, { status: 500 });
        }
        return Response.json({ ok: true });
      },
    },
  },
});
