import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function fetchGranolaKey(userId: string): Promise<string | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("granola_connections")
    .select("api_key")
    .eq("analyst_id", userId)
    .maybeSingle();
  return data?.api_key ?? null;
}

export const getGranolaStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const key = await fetchGranolaKey(context.userId);
    return { connected: !!key };
  });

const SaveKeyInput = z.object({ apiKey: z.string().trim().min(10).max(512) });

export const saveGranolaKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SaveKeyInput.parse(input))
  .handler(async ({ data, context }) => {
    // Validate the key by hitting Granola /v1/notes with limit=1
    const probe = await fetch("https://api.granola.ai/v1/notes?limit=1", {
      method: "GET",
      headers: { Authorization: `Bearer ${data.apiKey}` },
    });
    if (!probe.ok) {
      const text = await probe.text().catch(() => "");
      throw new Error(
        `Granola rejected the key (${probe.status}). ${text.slice(0, 200)}`,
      );
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("granola_connections")
      .upsert(
        { analyst_id: context.userId, api_key: data.apiKey },
        { onConflict: "analyst_id" },
      );
    return { connected: true };
  });

export const disconnectGranola = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("granola_connections").delete().eq("analyst_id", context.userId);
    return { connected: false };
  });

export const listGranolaFolders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const key = await fetchGranolaKey(context.userId);
    if (!key) return { folders: [] as { id: string; name: string }[], error: "No Granola key on file." };

    try {
      const res = await fetch("https://api.granola.ai/v1/folders?page_size=30", {
        headers: { Authorization: `Bearer ${key}` },
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        return { folders: [], error: `Granola returned ${res.status}: ${text.slice(0, 200)}` };
      }
      const json = (await res.json()) as { folders?: Array<{ id: string; name: string }> };
      return { folders: json.folders ?? [], error: null as string | null };
    } catch (e) {
      return { folders: [], error: e instanceof Error ? e.message : "Network error" };
    }
  });

const MappingInput = z.object({
  granolaFolderId: z.string().min(1),
  granolaFolderName: z.string().min(1),
  clientId: z.string().uuid(),
});

export const addFolderMapping = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => MappingInput.parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("folder_mappings").insert({
      analyst_id: context.userId,
      granola_folder_id: data.granolaFolderId,
      granola_folder_name: data.granolaFolderName,
      client_id: data.clientId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const removeFolderMapping = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("folder_mappings").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listFolderMappings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("folder_mappings")
      .select("id, granola_folder_id, granola_folder_name, client_id, clients(name)")
      .order("created_at", { ascending: false });
    return (data ?? []).map((m: any) => ({
      id: m.id,
      folderId: m.granola_folder_id,
      folderName: m.granola_folder_name,
      clientId: m.client_id,
      clientName: m.clients?.name ?? "—",
    }));
  });
