import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type EntryListItem = {
  id: string;
  projectId: string;
  projectName: string;
  authorId: string;
  authorName: string | null;
  title: string;
  entryDate: string | null;
  body: string;
  status: "draft" | "published";
  publishedAt: string | null;
  updatedAt: string;
  createdAt: string;
  people: { id: string; fullName: string }[];
};

async function loadEntries(supabase: any, opts: { projectId?: string; status?: "draft" | "published"; authorId?: string }) {
  let query = supabase
    .from("entries")
    .select(
      "id, project_id, author_id, title, entry_date, body, status, published_at, updated_at, created_at, " +
        "projects!inner(name), profiles!entries_author_id_fkey(full_name, email), " +
        "entry_people(person_id, people!inner(id, full_name))",
    );
  if (opts.projectId) query = query.eq("project_id", opts.projectId);
  if (opts.status) query = query.eq("status", opts.status);
  if (opts.authorId) query = query.eq("author_id", opts.authorId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return ((data ?? []) as any[]).map(
    (r): EntryListItem => ({
      id: r.id,
      projectId: r.project_id,
      projectName: r.projects?.name ?? "",
      authorId: r.author_id,
      authorName: r.profiles?.full_name ?? r.profiles?.email ?? null,
      title: r.title,
      entryDate: r.entry_date,
      body: r.body ?? "",
      status: r.status,
      publishedAt: r.published_at,
      updatedAt: r.updated_at,
      createdAt: r.created_at,
      people: (r.entry_people ?? []).map((ep: any) => ({
        id: ep.people.id,
        fullName: ep.people.full_name,
      })),
    }),
  );
}

export const listProjectEntries = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ projectId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const all = await loadEntries(context.supabase, { projectId: data.projectId });
    // Published: all members see. Drafts: only own (RLS already enforces; sort here).
    const published = all
      .filter((e) => e.status === "published")
      .sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));
    const myDrafts = all
      .filter((e) => e.status === "draft" && e.authorId === context.userId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return { published, myDrafts };
  });

export const listLatestAcrossMyProjects = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const entries = await loadEntries(context.supabase, { status: "published" });
    return entries.sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));
  });

export const getEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("entries")
      .select(
        "id, project_id, author_id, title, entry_date, body, status, published_at, updated_at, created_at, " +
          "projects!inner(name), profiles!entries_author_id_fkey(full_name, email), " +
          "entry_people(person_id, people!inner(id, full_name))",
      )
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Not found");
    const r = row as any;
    return {
      id: r.id,
      projectId: r.project_id,
      projectName: r.projects?.name ?? "",
      authorId: r.author_id,
      authorName: r.profiles?.full_name ?? r.profiles?.email ?? null,
      title: r.title,
      entryDate: r.entry_date,
      body: r.body ?? "",
      status: r.status as "draft" | "published",
      publishedAt: r.published_at,
      updatedAt: r.updated_at,
      createdAt: r.created_at,
      people: (r.entry_people ?? []).map((ep: any) => ({
        id: ep.people.id,
        fullName: ep.people.full_name,
      })),
    };
  });

export const createDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ projectId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("entries")
      .insert({
        project_id: data.projectId,
        author_id: context.userId,
        title: "Untitled",
        body: "",
        status: "draft",
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

const UpdateInput = z.object({
  id: z.string().uuid(),
  title: z.string().max(500).optional(),
  entryDate: z.string().nullable().optional(),
  body: z.string().max(50000).optional(),
  peopleIds: z.array(z.string().uuid()).optional(),
});

export const updateDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => UpdateInput.parse(input))
  .handler(async ({ data, context }) => {
    const patch: any = {};
    if (data.title !== undefined) patch.title = data.title.trim() || "Untitled";
    if (data.entryDate !== undefined) patch.entry_date = data.entryDate;
    if (data.body !== undefined) patch.body = data.body;
    if (Object.keys(patch).length > 0) {
      const { error } = await context.supabase
        .from("entries")
        .update(patch)
        .eq("id", data.id)
        .eq("author_id", context.userId)
        .eq("status", "draft");
      if (error) throw new Error(error.message);
    }
    if (data.peopleIds !== undefined) {
      // Rewrite entry_people
      const { data: existing } = await context.supabase
        .from("entry_people")
        .select("person_id")
        .eq("entry_id", data.id);
      const have = new Set((existing ?? []).map((r: any) => r.person_id));
      const want = new Set(data.peopleIds);
      const toAdd = [...want].filter((p) => !have.has(p));
      const toRemove = [...have].filter((p) => !want.has(p as string));
      if (toAdd.length > 0) {
        await context.supabase
          .from("entry_people")
          .insert(toAdd.map((person_id) => ({ entry_id: data.id, person_id })));
      }
      if (toRemove.length > 0) {
        await context.supabase
          .from("entry_people")
          .delete()
          .eq("entry_id", data.id)
          .in("person_id", toRemove as string[]);
      }
    }
    return { ok: true };
  });

export const publishEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("entries")
      .update({ status: "published", published_at: new Date().toISOString() })
      .eq("id", data.id)
      .eq("author_id", context.userId)
      .eq("status", "draft");
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("entries")
      .delete()
      .eq("id", data.id)
      .eq("author_id", context.userId)
      .eq("status", "draft");
    if (error) throw new Error(error.message);
    return { ok: true };
  });
