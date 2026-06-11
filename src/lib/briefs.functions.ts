import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getPendingBriefs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("briefs")
      .select("id, client_id, call_title, call_date, participants, body, status, created_at, clients(name)")
      .eq("analyst_id", context.userId)
      .eq("status", "pending")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map((b: any) => ({
      id: b.id,
      clientId: b.client_id,
      clientName: b.clients?.name ?? "—",
      callTitle: b.call_title,
      callDate: b.call_date,
      participants: b.participants ?? "",
      body: b.body ?? "",
      createdAt: b.created_at,
    }));
  });

export const getPublishedBriefs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("briefs")
      .select("id, client_id, call_title, call_date, participants, body, published_at, clients(name), brief_reads(client_user_id)")
      .eq("analyst_id", context.userId)
      .eq("status", "published")
      .order("published_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map((b: any) => ({
      id: b.id,
      clientId: b.client_id,
      clientName: b.clients?.name ?? "—",
      callTitle: b.call_title,
      callDate: b.call_date,
      participants: b.participants ?? "",
      body: b.body ?? "",
      publishedAt: b.published_at,
      hasReads: (b.brief_reads ?? []).length > 0,
    }));
  });

const UpdateInput = z.object({
  id: z.string().uuid(),
  body: z.string().max(20000).optional(),
  callTitle: z.string().max(500).optional(),
  participants: z.string().max(1000).optional(),
});

export const updateBriefDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => UpdateInput.parse(input))
  .handler(async ({ data, context }) => {
    const patch: Record<string, unknown> = {};
    if (data.body !== undefined) patch.body = data.body;
    if (data.callTitle !== undefined) patch.call_title = data.callTitle;
    if (data.participants !== undefined) patch.participants = data.participants;
    const { error } = await context.supabase
      .from("briefs")
      .update(patch)
      .eq("id", data.id)
      .eq("analyst_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const publishBrief = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("briefs")
      .update({ status: "published", published_at: new Date().toISOString() })
      .eq("id", data.id)
      .eq("analyst_id", context.userId)
      .eq("status", "pending");
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const rejectBrief = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("briefs")
      .update({ status: "rejected" })
      .eq("id", data.id)
      .eq("analyst_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Client feed
export const getClientFeed = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: profile } = await context.supabase
      .from("profiles")
      .select("client_id, clients(name)")
      .eq("id", context.userId)
      .maybeSingle();
    if (!profile?.client_id) return { briefs: [], clientName: null as string | null };

    const { data, error } = await context.supabase
      .from("briefs")
      .select("id, call_title, call_date, participants, body, published_at, brief_reads!left(client_user_id)")
      .eq("client_id", profile.client_id)
      .eq("status", "published")
      .order("published_at", { ascending: false });
    if (error) throw new Error(error.message);

    const briefs = (data ?? []).map((b: any) => ({
      id: b.id,
      callTitle: b.call_title,
      callDate: b.call_date,
      participants: b.participants ?? "",
      body: b.body ?? "",
      publishedAt: b.published_at,
      isRead: (b.brief_reads ?? []).some((r: any) => r.client_user_id === context.userId),
    }));
    return { briefs, clientName: ((profile as any).clients?.name) ?? null };
  });

export const markBriefRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ briefId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await context.supabase
      .from("brief_reads")
      .upsert(
        { brief_id: data.briefId, client_user_id: context.userId },
        { onConflict: "brief_id,client_user_id" },
      );
    return { ok: true };
  });
