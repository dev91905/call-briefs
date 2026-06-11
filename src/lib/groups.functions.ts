import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type GroupSummary = {
  id: string;
  name: string;
  entryCount: number;
  lastActivity: string | null;
};

export const listProjectGroups = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ projectId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<GroupSummary[]> => {
    const { supabase } = context;
    const { data: groups, error } = await supabase
      .from("groups")
      .select("id, name")
      .eq("project_id", data.projectId)
      .order("name");
    if (error) throw new Error(error.message);
    if (!groups || groups.length === 0) return [];

    const ids = groups.map((g: any) => g.id);
    const { data: links } = await supabase
      .from("entry_groups")
      .select("group_id, entries!inner(status, published_at)")
      .in("group_id", ids);

    const stats = new Map<string, { count: number; last: string | null }>();
    ((links ?? []) as any[]).forEach((l) => {
      if (l.entries?.status !== "published") return;
      const cur = stats.get(l.group_id) ?? { count: 0, last: null };
      cur.count += 1;
      if (l.entries.published_at && (!cur.last || l.entries.published_at > cur.last)) {
        cur.last = l.entries.published_at;
      }
      stats.set(l.group_id, cur);
    });

    return groups.map((g: any) => ({
      id: g.id,
      name: g.name,
      entryCount: stats.get(g.id)?.count ?? 0,
      lastActivity: stats.get(g.id)?.last ?? null,
    }));
  });

export const suggestGroups = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ projectId: z.string().uuid(), query: z.string().max(100) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("groups")
      .select("id, name")
      .eq("project_id", data.projectId)
      .order("name")
      .limit(8);
    if (data.query.trim().length > 0) q = q.ilike("name", `%${data.query.trim()}%`);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r: any) => ({ id: r.id, fullName: r.name }));
  });

export const createGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ projectId: z.string().uuid(), name: z.string().trim().min(1).max(120) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: existing } = await context.supabase
      .from("groups")
      .select("id, name")
      .eq("project_id", data.projectId)
      .ilike("name", data.name)
      .maybeSingle();
    if (existing) return { id: existing.id, fullName: existing.name };

    const { data: row, error } = await context.supabase
      .from("groups")
      .insert({
        project_id: data.projectId,
        name: data.name,
        created_by: context.userId,
      })
      .select("id, name")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id, fullName: row.name };
  });

export const renameGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        projectId: z.string().uuid(),
        groupId: z.string().uuid(),
        name: z.string().trim().min(1).max(120),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("groups")
      .update({ name: data.name })
      .eq("id", data.groupId)
      .eq("project_id", data.projectId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ projectId: z.string().uuid(), groupId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("groups")
      .delete()
      .eq("id", data.groupId)
      .eq("project_id", data.projectId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ projectId: z.string().uuid(), groupId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("groups")
      .select("id, name, created_at, created_by")
      .eq("id", data.groupId)
      .eq("project_id", data.projectId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Not found");

    const [{ data: links }, { data: creator }] = await Promise.all([
      context.supabase
        .from("entry_groups")
        .select("entries!inner(id, status, published_at)")
        .eq("group_id", data.groupId),
      context.supabase
        .from("profiles")
        .select("full_name, email")
        .eq("id", row.created_by)
        .maybeSingle(),
    ]);

    const published = ((links ?? []) as any[])
      .map((l) => l.entries)
      .filter((e) => e && e.status === "published");
    const lastActivity = published
      .map((e) => e.published_at as string | null)
      .filter(Boolean)
      .sort((a, b) => (b ?? "").localeCompare(a ?? ""))[0] ?? null;

    return {
      id: row.id,
      name: row.name,
      entryCount: published.length,
      createdBy: creator?.full_name ?? creator?.email ?? null,
      lastActivity,
    };
  });
