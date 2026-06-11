import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const suggestTags = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ projectId: z.string().uuid(), query: z.string().max(100) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("tags")
      .select("id, name")
      .eq("project_id", data.projectId)
      .order("name")
      .limit(10);
    if (data.query.trim().length > 0) q = q.ilike("name", `%${data.query.trim()}%`);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r: any) => ({ id: r.id, fullName: r.name }));
  });

export const createTag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ projectId: z.string().uuid(), name: z.string().trim().min(1).max(60) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: existing } = await context.supabase
      .from("tags")
      .select("id, name")
      .eq("project_id", data.projectId)
      .ilike("name", data.name)
      .maybeSingle();
    if (existing) return { id: existing.id, fullName: existing.name };

    const { data: row, error } = await context.supabase
      .from("tags")
      .insert({ project_id: data.projectId, name: data.name })
      .select("id, name")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id, fullName: row.name };
  });

export const listProjectTags = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ projectId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("tags")
      .select("id, name")
      .eq("project_id", data.projectId)
      .order("name");
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r: any) => ({ id: r.id, name: r.name }));
  });

export const topTagThisMonth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ projectId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<{ id: string; name: string; count: number } | null> => {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: rows } = await context.supabase
      .from("entry_tags")
      .select("tag_id, tags!inner(id, name, project_id), entries!inner(status, published_at, project_id)")
      .eq("tags.project_id", data.projectId)
      .eq("entries.status", "published")
      .gte("entries.published_at", since);
    const counts = new Map<string, { id: string; name: string; count: number }>();
    ((rows ?? []) as any[]).forEach((r) => {
      const t = r.tags;
      if (!t) return;
      const cur = counts.get(t.id) ?? { id: t.id, name: t.name, count: 0 };
      cur.count += 1;
      counts.set(t.id, cur);
    });
    let best: { id: string; name: string; count: number } | null = null;
    for (const v of counts.values()) {
      if (!best || v.count > best.count) best = v;
    }
    return best;
  });
