import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type PortalRole = "owner" | "co_owner" | "analyst";

export type PortalSummary = {
  id: string;
  name: string;
  slug: string;
  role: PortalRole;
};

async function assertMember(supabase: any, userId: string, portalId: string, min: "any" | "admin" = "any") {
  if (min === "admin") {
    const { data } = await supabase.rpc("is_portal_admin", { _user: userId, _portal: portalId });
    if (!data) throw new Error("Forbidden");
  } else {
    const { data } = await supabase.rpc("is_portal_member", { _user: userId, _portal: portalId });
    if (!data) throw new Error("Forbidden");
  }
}

function slugify(name: string) {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "portal"
  ) + "-" + Math.random().toString(36).slice(2, 8);
}

export const listMyPortals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PortalSummary[]> => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("portal_members")
      .select("role, portals:portal_id(id, name, slug)")
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return (data ?? [])
      .map((row: any) => row.portals && ({
        id: row.portals.id,
        name: row.portals.name,
        slug: row.portals.slug,
        role: row.role,
      }))
      .filter(Boolean)
      .sort((a: PortalSummary, b: PortalSummary) => a.name.localeCompare(b.name));
  });

export const createPortal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ name: z.string().trim().min(1).max(120) }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: portal, error } = await supabase
      .from("portals")
      .insert({ name: data.name, slug: slugify(data.name), owner_id: userId })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    await supabase.from("portal_members").insert({ portal_id: portal.id, user_id: userId, role: "owner" });
    await supabase.from("portal_form_schema").insert({ portal_id: portal.id, fields: [] });
    return { id: portal.id };
  });

export const getPortal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ portalId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertMember(supabase, userId, data.portalId);
    const { data: portal, error } = await supabase
      .from("portals")
      .select("id, name, slug, owner_id")
      .eq("id", data.portalId)
      .single();
    if (error) throw new Error(error.message);

    const { data: roleRow } = await supabase
      .from("portal_members")
      .select("role")
      .eq("portal_id", data.portalId)
      .eq("user_id", userId)
      .maybeSingle();

    return { ...portal, myRole: (roleRow?.role ?? "analyst") as PortalRole };
  });

export const renamePortal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ portalId: z.string().uuid(), name: z.string().trim().min(1).max(120) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase, context.userId, data.portalId, "admin");
    const { error } = await context.supabase.from("portals").update({ name: data.name }).eq("id", data.portalId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listMembers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ portalId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase, context.userId, data.portalId);
    const { data: members } = await context.supabase
      .from("portal_members")
      .select("user_id, role, joined_at")
      .eq("portal_id", data.portalId);
    const ids = (members ?? []).map((m: any) => m.user_id);
    if (ids.length === 0) return [];
    const { data: profiles } = await context.supabase
      .from("profiles")
      .select("id, email, full_name")
      .in("id", ids);
    const pmap = new Map((profiles ?? []).map((p: any) => [p.id, p]));
    return (members ?? []).map((m: any) => ({
      userId: m.user_id,
      role: m.role as PortalRole,
      joinedAt: m.joined_at,
      email: (pmap.get(m.user_id) as any)?.email ?? "",
      fullName: (pmap.get(m.user_id) as any)?.full_name ?? null,
    }));
  });

export const inviteMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        portalId: z.string().uuid(),
        email: z.string().trim().email().max(255),
        role: z.enum(["analyst", "co_owner"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase, context.userId, data.portalId, "admin");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: existing } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("email", data.email)
      .maybeSingle();

    let userId = existing?.id ?? null;
    if (!userId) {
      const { data: invited, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(data.email);
      if (error) throw new Error(error.message);
      userId = invited.user?.id ?? null;
      if (!userId) throw new Error("Invite failed.");
    }

    const { error: insertErr } = await supabaseAdmin
      .from("portal_members")
      .upsert(
        { portal_id: data.portalId, user_id: userId, role: data.role, invited_by: context.userId },
        { onConflict: "portal_id,user_id" },
      );
    if (insertErr) throw new Error(insertErr.message);
    return { ok: true };
  });

export const setMemberRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        portalId: z.string().uuid(),
        userId: z.string().uuid(),
        role: z.enum(["owner", "co_owner", "analyst"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase, context.userId, data.portalId, "admin");
    if (data.role === "owner") {
      // Transfer ownership: demote current owner to co_owner
      await context.supabase
        .from("portal_members")
        .update({ role: "co_owner" })
        .eq("portal_id", data.portalId)
        .eq("role", "owner");
      await context.supabase.from("portals").update({ owner_id: data.userId }).eq("id", data.portalId);
    }
    const { error } = await context.supabase
      .from("portal_members")
      .update({ role: data.role })
      .eq("portal_id", data.portalId)
      .eq("user_id", data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const removeMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ portalId: z.string().uuid(), userId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase, context.userId, data.portalId, "admin");
    const { error } = await context.supabase
      .from("portal_members")
      .delete()
      .eq("portal_id", data.portalId)
      .eq("user_id", data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
