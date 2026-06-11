import { createFileRoute } from "@tanstack/react-router";
import { generateText } from "ai";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";
import { DRAFTING_SYSTEM_PROMPT, buildDraftingUserPrompt } from "@/lib/drafting-prompt.server";

type GranolaNote = {
  id: string;
  title?: string;
  created_at?: string;
  summary?: string;
  transcript?: string;
  participants?: Array<{ name?: string; email?: string }> | string[] | string;
};

function fmtParticipants(p: GranolaNote["participants"]): string {
  if (!p) return "";
  if (typeof p === "string") return p;
  if (Array.isArray(p)) {
    return p
      .map((x) => (typeof x === "string" ? x : x?.name || x?.email || ""))
      .filter(Boolean)
      .join(", ");
  }
  return "";
}

async function granolaFetch(key: string, path: string): Promise<Response> {
  return fetch(`https://api.granola.ai${path}`, {
    headers: { Authorization: `Bearer ${key}` },
  });
}

export const Route = createFileRoute("/api/public/cron/poll-granola")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env.CRON_SECRET;
        if (!expected) return new Response("CRON_SECRET not configured", { status: 500 });
        const auth = request.headers.get("authorization") ?? "";
        if (auth !== `Bearer ${expected}`) {
          return new Response("Unauthorized", { status: 401 });
        }

        const lovableKey = process.env.LOVABLE_API_KEY;
        if (!lovableKey) return new Response("LOVABLE_API_KEY missing", { status: 500 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: connections } = await supabaseAdmin
          .from("granola_connections")
          .select("analyst_id, api_key, last_polled_at");

        const gateway = createLovableAiGatewayProvider(lovableKey);
        const model = gateway("google/gemini-3-flash-preview");

        let processed = 0;
        let drafted = 0;
        let skipped = 0;

        for (const conn of connections ?? []) {
          const { data: mappings } = await supabaseAdmin
            .from("folder_mappings")
            .select("granola_folder_id, client_id, clients(name)")
            .eq("analyst_id", conn.analyst_id);
          if (!mappings || mappings.length === 0) continue;

          for (const m of mappings as any[]) {
            const since = conn.last_polled_at
              ? `&created_after=${encodeURIComponent(conn.last_polled_at)}`
              : "";
            const res = await granolaFetch(
              conn.api_key,
              `/v1/notes?limit=20&folder_id=${encodeURIComponent(m.granola_folder_id)}${since}`,
            );
            if (!res.ok) continue;
            const json = (await res.json()) as { notes?: GranolaNote[] };
            const notes = json.notes ?? [];

            for (const note of notes) {
              processed++;
              const noteId = note.id;
              if (!noteId) continue;

              // Dedupe per (note, client)
              const { data: exists } = await supabaseAdmin
                .from("briefs")
                .select("id")
                .eq("granola_note_id", noteId)
                .eq("client_id", m.client_id)
                .maybeSingle();
              if (exists) continue;

              const source = note.summary || note.transcript || "";
              if (!source || source.trim().length < 40) {
                await supabaseAdmin.from("briefs").insert({
                  client_id: m.client_id,
                  analyst_id: conn.analyst_id,
                  granola_note_id: noteId,
                  call_title: note.title ?? "Untitled call",
                  call_date: note.created_at ? note.created_at.slice(0, 10) : null,
                  participants: fmtParticipants(note.participants),
                  body: "",
                  status: "skipped",
                  skip_reason: "Source note too short to draft.",
                });
                skipped++;
                continue;
              }

              try {
                const { text } = await generateText({
                  model,
                  system: DRAFTING_SYSTEM_PROMPT,
                  prompt: buildDraftingUserPrompt({
                    clientName: m.clients?.name ?? "client",
                    callTitle: note.title ?? "Untitled call",
                    callDate: note.created_at ? note.created_at.slice(0, 10) : null,
                    participants: fmtParticipants(note.participants),
                    noteSummary: note.summary ?? "",
                    transcriptFallback: note.transcript ?? null,
                  }),
                });

                const trimmed = text.trim();
                if (trimmed.toUpperCase().startsWith("SKIP:")) {
                  await supabaseAdmin.from("briefs").insert({
                    client_id: m.client_id,
                    analyst_id: conn.analyst_id,
                    granola_note_id: noteId,
                    call_title: note.title ?? "Untitled call",
                    call_date: note.created_at ? note.created_at.slice(0, 10) : null,
                    participants: fmtParticipants(note.participants),
                    body: "",
                    status: "skipped",
                    skip_reason: trimmed.slice(5).trim().slice(0, 200),
                  });
                  skipped++;
                } else {
                  await supabaseAdmin.from("briefs").insert({
                    client_id: m.client_id,
                    analyst_id: conn.analyst_id,
                    granola_note_id: noteId,
                    call_title: note.title ?? "Untitled call",
                    call_date: note.created_at ? note.created_at.slice(0, 10) : null,
                    participants: fmtParticipants(note.participants),
                    body: trimmed,
                    status: "pending",
                  });
                  drafted++;
                }
              } catch (e) {
                console.error("[poll-granola] draft error", e);
              }

              // Light pacing: stay well under 5 req/s on the Granola side.
              await new Promise((r) => setTimeout(r, 250));
            }
          }

          await supabaseAdmin
            .from("granola_connections")
            .update({ last_polled_at: new Date().toISOString() })
            .eq("analyst_id", conn.analyst_id);
        }

        return Response.json({ ok: true, processed, drafted, skipped });
      },
    },
  },
});
