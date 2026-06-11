import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type ProjectSummary = {
  id: string;
  name: string;
  role: "owner" | "co_owner" | "member";
  memberCount: number;
  entryCount: number;
};

async function getRole(supabase: any, userId: string, projectId: string) {
  const { data } = await supabase
    .from("project_members")
    .select("role")
    .eq("project_id", projectId)
    .eq("user_id", userId)
    .maybeSingle();
  return (data?.role ?? null) as "owner" | "co_owner" | "member" | null;
}

async function assertOwnerOrCoOwner(supabase: any, userId: string, projectId: string) {
  const role = await getRole(supabase, userId, projectId);
  if (role !== "owner" && role !== "co_owner") throw new Error("Forbidden");
  return role;
}

async function assertOwner(supabase: any, userId: string, projectId: string) {
  const role = await getRole(supabase, userId, projectId);
  if (role !== "owner") throw new Error("Owner only");
}

export const listMyProjects = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ProjectSummary[]> => {
    const { supabase, userId } = context;
    const { data: memberships, error } = await supabase
      .from("project_members")
      .select("role, project_id, projects!inner(id, name)")
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    const rows = (memberships ?? []) as any[];
    const projectIds = rows.map((m) => m.project_id);
    if (projectIds.length === 0) return [];

    const [memberCounts, entryCounts] = await Promise.all([
      supabase.from("project_members").select("project_id").in("project_id", projectIds),
      supabase
        .from("entries")
        .select("project_id")
        .eq("status", "published")
        .in("project_id", projectIds),
    ]);

    const memberCountByProject = new Map<string, number>();
    (memberCounts.data ?? []).forEach((r: any) => {
      memberCountByProject.set(r.project_id, (memberCountByProject.get(r.project_id) ?? 0) + 1);
    });
    const entryCountByProject = new Map<string, number>();
    (entryCounts.data ?? []).forEach((r: any) => {
      entryCountByProject.set(r.project_id, (entryCountByProject.get(r.project_id) ?? 0) + 1);
    });

    return rows
      .map((m) => ({
        id: m.projects.id,
        name: m.projects.name,
        role: m.role,
        memberCount: memberCountByProject.get(m.project_id) ?? 0,
        entryCount: entryCountByProject.get(m.project_id) ?? 0,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  });

export const getProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: project, error } = await supabase
      .from("projects")
      .select("id, name, created_by, created_at")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!project) throw new Error("Not found");
    const role = await getRole(supabase, userId, project.id);
    return { ...project, myRole: role };
  });

export const createProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ name: z.string().trim().min(1).max(120) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: project, error } = await supabase
      .from("projects")
      .insert({ name: data.name, created_by: userId })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    const { error: mErr } = await supabase
      .from("project_members")
      .insert({ project_id: project.id, user_id: userId, role: "owner" });
    if (mErr) throw new Error(mErr.message);
    return { id: project.id };
  });

export const renameProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), name: z.string().trim().min(1).max(120) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertOwnerOrCoOwner(context.supabase, context.userId, data.id);
    const { error } = await context.supabase
      .from("projects")
      .update({ name: data.name })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertOwner(context.supabase, context.userId, data.id);
    const { error } = await context.supabase.from("projects").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Members ----------

export type MemberRow = {
  userId: string;
  email: string;
  fullName: string | null;
  role: "owner" | "co_owner" | "member";
};

export const listMembers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ projectId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<{ members: MemberRow[]; invites: { id: string; email: string; role: string }[] }> => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("project_members")
      .select("user_id, role, profiles!inner(email, full_name)")
      .eq("project_id", data.projectId);
    if (error) throw new Error(error.message);
    const members = (rows ?? []).map((r: any) => ({
      userId: r.user_id,
      email: r.profiles.email,
      fullName: r.profiles.full_name,
      role: r.role,
    }));
    const { data: invites } = await supabase
      .from("pending_invites")
      .select("id, email, role")
      .eq("project_id", data.projectId);
    return { members, invites: invites ?? [] };
  });

const InviteSchema = z.object({
  projectId: z.string().uuid(),
  email: z.string().trim().email().max(255),
  role: z.enum(["member", "co_owner"]).default("member"),
});

export const inviteToProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => InviteSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertOwnerOrCoOwner(context.supabase, context.userId, data.projectId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Look up existing user
    const { data: existing } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .ilike("email", data.email)
      .maybeSingle();

    if (existing?.id) {
      await supabaseAdmin
        .from("project_members")
        .upsert(
          { project_id: data.projectId, user_id: existing.id, role: data.role },
          { onConflict: "project_id,user_id" },
        );
      return { ok: true, status: "added" as const };
    }

    // Not registered: send Supabase invite + record pending row
    const { error: invErr } = await supabaseAdmin.auth.admin.inviteUserByEmail(data.email);
    if (invErr && !/already/i.test(invErr.message)) throw new Error(invErr.message);
    await supabaseAdmin.from("pending_invites").upsert(
      {
        project_id: data.projectId,
        email: data.email.toLowerCase(),
        role: data.role,
        invited_by: context.userId,
      },
      { onConflict: "project_id,email" },
    );
    return { ok: true, status: "invited" as const };
  });

export const setMemberRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        projectId: z.string().uuid(),
        userId: z.string().uuid(),
        role: z.enum(["co_owner", "member"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertOwnerOrCoOwner(context.supabase, context.userId, data.projectId);
    // Cannot demote the sole owner. Cannot change owner via this endpoint.
    const { data: target } = await context.supabase
      .from("project_members")
      .select("role")
      .eq("project_id", data.projectId)
      .eq("user_id", data.userId)
      .maybeSingle();
    if (target?.role === "owner") throw new Error("Use Transfer ownership to change the owner.");
    const { error } = await context.supabase
      .from("project_members")
      .update({ role: data.role })
      .eq("project_id", data.projectId)
      .eq("user_id", data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const removeMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ projectId: z.string().uuid(), userId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertOwnerOrCoOwner(context.supabase, context.userId, data.projectId);
    const { data: target } = await context.supabase
      .from("project_members")
      .select("role")
      .eq("project_id", data.projectId)
      .eq("user_id", data.userId)
      .maybeSingle();
    if (target?.role === "owner") throw new Error("Cannot remove the owner.");
    const { error } = await context.supabase
      .from("project_members")
      .delete()
      .eq("project_id", data.projectId)
      .eq("user_id", data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const leaveProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ projectId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const role = await getRole(context.supabase, context.userId, data.projectId);
    if (role === "owner") throw new Error("Transfer ownership before leaving.");
    const { error } = await context.supabase
      .from("project_members")
      .delete()
      .eq("project_id", data.projectId)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const transferOwnership = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ projectId: z.string().uuid(), newOwnerId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertOwner(context.supabase, context.userId, data.projectId);
    // Promote new owner, demote old to co_owner
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: e1 } = await supabaseAdmin
      .from("project_members")
      .update({ role: "owner" })
      .eq("project_id", data.projectId)
      .eq("user_id", data.newOwnerId);
    if (e1) throw new Error(e1.message);
    const { error: e2 } = await supabaseAdmin
      .from("project_members")
      .update({ role: "co_owner" })
      .eq("project_id", data.projectId)
      .eq("user_id", context.userId);
    if (e2) throw new Error(e2.message);
    return { ok: true };
  });

export const revokeInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ projectId: z.string().uuid(), inviteId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertOwnerOrCoOwner(context.supabase, context.userId, data.projectId);
    const { error } = await context.supabase
      .from("pending_invites")
      .delete()
      .eq("id", data.inviteId)
      .eq("project_id", data.projectId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
