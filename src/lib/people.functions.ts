import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type PersonSummary = {
  id: string;
  fullName: string;
  entryCount: number;
  lastSeen: string | null;
};

export const listProjectPeople = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ projectId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<PersonSummary[]> => {
    const { supabase } = context;
    const { data: people, error } = await supabase
      .from("people")
      .select("id, full_name")
      .eq("project_id", data.projectId);
    if (error) throw new Error(error.message);
    if (!people || people.length === 0) return [];

    const ids = people.map((p: any) => p.id);
    const { data: links } = await supabase
      .from("entry_people")
      .select("person_id, entries!inner(status, published_at)")
      .in("person_id", ids);

    const stats = new Map<string, { count: number; last: string | null }>();
    ((links ?? []) as any[]).forEach((l) => {
      if (l.entries?.status !== "published") return;
      const cur = stats.get(l.person_id) ?? { count: 0, last: null };
      cur.count += 1;
      if (l.entries.published_at && (!cur.last || l.entries.published_at > cur.last)) {
        cur.last = l.entries.published_at;
      }
      stats.set(l.person_id, cur);
    });

    return people
      .map((p: any) => ({
        id: p.id,
        fullName: p.full_name,
        entryCount: stats.get(p.id)?.count ?? 0,
        lastSeen: stats.get(p.id)?.last ?? null,
      }))
      .sort((a, b) => a.fullName.localeCompare(b.fullName));
  });

export const getPersonDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ projectId: z.string().uuid(), personId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: person, error } = await context.supabase
      .from("people")
      .select("id, full_name, project_id")
      .eq("id", data.personId)
      .eq("project_id", data.projectId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!person) throw new Error("Not found");

    const { data: links } = await context.supabase
      .from("entry_people")
      .select(
        "entries!inner(id, title, entry_date, body, status, published_at, " +
          "profiles!entries_author_id_fkey(full_name, email))",
      )
      .eq("person_id", data.personId);

    const entries = ((links ?? []) as any[])
      .map((l) => l.entries)
      .filter((e) => e && e.status === "published")
      .map((e) => ({
        id: e.id,
        title: e.title,
        entryDate: e.entry_date,
        body: e.body ?? "",
        publishedAt: e.published_at,
        authorName: e.profiles?.full_name ?? e.profiles?.email ?? null,
      }))
      .sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));

    return { id: person.id, fullName: person.full_name, entries };
  });

export const suggestPeople = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ projectId: z.string().uuid(), query: z.string().max(100) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("people")
      .select("id, full_name")
      .eq("project_id", data.projectId)
      .order("full_name")
      .limit(8);
    if (data.query.trim().length > 0) q = q.ilike("full_name", `%${data.query.trim()}%`);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r: any) => ({ id: r.id, fullName: r.full_name }));
  });

export const createPerson = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ projectId: z.string().uuid(), fullName: z.string().trim().min(1).max(120) })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    // Try existing first (case-insensitive)
    const { data: existing } = await context.supabase
      .from("people")
      .select("id, full_name")
      .eq("project_id", data.projectId)
      .ilike("full_name", data.fullName)
      .maybeSingle();
    if (existing) return { id: existing.id, fullName: existing.full_name };

    const { data: row, error } = await context.supabase
      .from("people")
      .insert({
        project_id: data.projectId,
        full_name: data.fullName,
        created_by: context.userId,
      })
      .select("id, full_name")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id, fullName: row.full_name };
  });

export const renamePerson = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        projectId: z.string().uuid(),
        personId: z.string().uuid(),
        fullName: z.string().trim().min(1).max(120),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("people")
      .update({ full_name: data.fullName })
      .eq("id", data.personId)
      .eq("project_id", data.projectId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const mergePeople = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        projectId: z.string().uuid(),
        fromId: z.string().uuid(),
        toId: z.string().uuid(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    if (data.fromId === data.toId) return { ok: true };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Get entry ids on `from`, then insert links to `to` (ignore conflict), then delete `from`.
    const { data: links } = await supabaseAdmin
      .from("entry_people")
      .select("entry_id")
      .eq("person_id", data.fromId);
    const entryIds = (links ?? []).map((r: any) => r.entry_id as string);
    if (entryIds.length > 0) {
      await supabaseAdmin
        .from("entry_people")
        .upsert(
          entryIds.map((entry_id) => ({ entry_id, person_id: data.toId })),
          { onConflict: "entry_id,person_id" },
        );
    }
    const { error } = await supabaseAdmin
      .from("people")
      .delete()
      .eq("id", data.fromId)
      .eq("project_id", data.projectId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
