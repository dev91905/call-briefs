import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertMember(supabase: any, userId: string, portalId: string) {
  const { data } = await supabase.rpc("is_portal_member", { _user: userId, _portal: portalId });
  if (!data) throw new Error("Forbidden");
}

export const listPortalRequests = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ portalId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase, context.userId, data.portalId);
    const { data: rows, error } = await context.supabase
      .from("portal_requests")
      .select("id, subject, body, status, created_at, created_by")
      .eq("portal_id", data.portalId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const createPortalRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        portalId: z.string().uuid(),
        subject: z.string().trim().min(1).max(300),
        body: z.string().trim().max(4000).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase, context.userId, data.portalId);
    const { error } = await context.supabase.from("portal_requests").insert({
      portal_id: data.portalId,
      subject: data.subject,
      body: data.body ?? null,
      created_by: context.userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setRequestStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        portalId: z.string().uuid(),
        id: z.string().uuid(),
        status: z.enum(["open", "closed"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase, context.userId, data.portalId);
    const { error } = await context.supabase
      .from("portal_requests")
      .update({ status: data.status })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
