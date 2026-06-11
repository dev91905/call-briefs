import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const CreateInput = z.object({
  briefId: z.string().uuid().nullable(),
  message: z.string().trim().min(1).max(2000),
});

export const createRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => CreateInput.parse(input))
  .handler(async ({ data, context }) => {
    const { data: profile } = await context.supabase
      .from("profiles")
      .select("client_id")
      .eq("id", context.userId)
      .maybeSingle();
    if (!profile?.client_id) throw new Error("Your account is not linked to a client yet.");

    const { error } = await context.supabase.from("requests").insert({
      client_id: profile.client_id,
      brief_id: data.briefId,
      created_by: context.userId,
      message: data.message,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listOpenRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("requests")
      .select(
        "id, message, status, created_at, brief_id, client_id, created_by, clients(name), briefs(call_title), profiles!requests_created_by_fkey(email, full_name)",
      )
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map((r: any) => ({
      id: r.id,
      message: r.message,
      status: r.status,
      createdAt: r.created_at,
      briefId: r.brief_id,
      briefTitle: r.briefs?.call_title ?? null,
      clientName: r.clients?.name ?? "—",
      clientId: r.client_id,
      requesterEmail: r.profiles?.email ?? "",
      requesterName: r.profiles?.full_name ?? null,
    }));
  });

export const resolveRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("requests")
      .update({ status: "resolved", resolved_by: context.userId, resolved_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const reopenRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("requests")
      .update({ status: "open", resolved_by: null, resolved_at: null })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
