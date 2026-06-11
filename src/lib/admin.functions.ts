import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(supabase: any, userId: string) {
  const { data } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (!data) throw new Error("Forbidden");
}

export const listClientsAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: clients } = await supabaseAdmin
      .from("clients")
      .select("id, name, created_at")
      .order("name");

    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("id, email, full_name, client_id, is_admin");

    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("user_id, role");

    const { data: mappings } = await supabaseAdmin
      .from("folder_mappings")
      .select("client_id, analyst_id");

    const analystIds = Array.from(new Set((mappings ?? []).map((m: any) => m.analyst_id).filter(Boolean)));
    const { data: analystProfiles } = analystIds.length
      ? await supabaseAdmin.from("profiles").select("id, email").in("id", analystIds)
      : { data: [] };
    const analystEmailById = new Map((analystProfiles ?? []).map((p: any) => [p.id, p.email]));

    const roleByUser = new Map<string, string[]>();
    (roles ?? []).forEach((r: any) => {
      const list = roleByUser.get(r.user_id) ?? [];
      list.push(r.role);
      roleByUser.set(r.user_id, list);
    });

    return (clients ?? []).map((c: any) => {
      const clientUsers = (profiles ?? [])
        .filter((p: any) => p.client_id === c.id && (roleByUser.get(p.id) ?? []).includes("client"))
        .map((p: any) => ({ id: p.id, email: p.email, fullName: p.full_name }));
      const analystEmails = Array.from(
        new Set(
          (mappings ?? [])
            .filter((m: any) => m.client_id === c.id)
            .map((m: any) => analystEmailById.get(m.analyst_id))
            .filter(Boolean),
        ),
      );
      return {
        id: c.id,
        name: c.name,
        createdAt: c.created_at,
        clientUsers,
        analystEmails,
      };
    });
  });

export const listAnalystsAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("user_id")
      .eq("role", "analyst");
    const ids = (roles ?? []).map((r: any) => r.user_id);
    if (ids.length === 0) return [];
    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("id, email, full_name, is_admin")
      .in("id", ids);
    return (profiles ?? []).map((p: any) => ({ id: p.id, email: p.email, fullName: p.full_name, isAdmin: p.is_admin }));
  });

const InviteInput = z.object({
  email: z.string().trim().email().max(255),
  role: z.enum(["client", "analyst"]),
  clientId: z.string().uuid().optional().nullable(),
});

export const inviteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => InviteInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (data.role === "client" && !data.clientId) {
      throw new Error("Client invites require a clientId.");
    }

    // Look up existing user
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
      if (!userId) throw new Error("Invite failed: no user id returned.");
    }

    // Upsert profile + role
    await supabaseAdmin
      .from("profiles")
      .upsert({
        id: userId,
        email: data.email,
        client_id: data.role === "client" ? data.clientId : null,
      });

    // Remove default 'client' role if assigning analyst
    if (data.role === "analyst") {
      await supabaseAdmin.from("user_roles").delete().eq("user_id", userId).eq("role", "client");
      await supabaseAdmin.from("user_roles").upsert(
        { user_id: userId, role: "analyst" },
        { onConflict: "user_id,role" },
      );
    } else {
      await supabaseAdmin.from("user_roles").upsert(
        { user_id: userId, role: "client" },
        { onConflict: "user_id,role" },
      );
    }

    return { ok: true, userId };
  });

const RenameInput = z.object({ id: z.string().uuid(), name: z.string().trim().min(1).max(120) });

export const renameClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => RenameInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("clients").update({ name: data.name }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const createClientAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ name: z.string().trim().min(1).max(120) }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("clients").insert({ name: data.name });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [briefs, reqs, profs, maps] = await Promise.all([
      supabaseAdmin.from("briefs").select("id", { count: "exact", head: true }).eq("client_id", data.id),
      supabaseAdmin.from("requests").select("id", { count: "exact", head: true }).eq("client_id", data.id),
      supabaseAdmin.from("profiles").select("id", { count: "exact", head: true }).eq("client_id", data.id),
      supabaseAdmin.from("folder_mappings").select("id", { count: "exact", head: true }).eq("client_id", data.id),
    ]);
    const counts = [
      ["brief", briefs.count ?? 0],
      ["request", reqs.count ?? 0],
      ["user", profs.count ?? 0],
      ["folder mapping", maps.count ?? 0],
    ] as const;
    const blockers = counts.filter(([, n]) => n > 0);
    if (blockers.length > 0) {
      throw new Error(
        "Cannot delete: client still has " +
          blockers.map(([k, n]) => `${n} ${k}${n === 1 ? "" : "s"}`).join(", ") +
          ". Reassign or remove them first.",
      );
    }

    const { error } = await supabaseAdmin.from("clients").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listClientsForSelect = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("clients")
      .select("id, name")
      .order("name");
    if (error) throw new Error(error.message);
    return data ?? [];
  });
