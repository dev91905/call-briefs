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
  dek: string | null;
  entryDate: string | null;
  body: string;
  status: "draft" | "published";
  publishedAt: string | null;
  updatedAt: string;
  createdAt: string;
  people: { id: string; fullName: string }[];
  participants: { id: string; fullName: string }[];
  mentioned: { id: string; fullName: string }[];
  groups: { id: string; name: string }[];
  tags: { id: string; name: string }[];
};

async function loadEntries(
  supabase: any,
  opts: { projectId?: string; status?: "draft" | "published"; authorId?: string; entryIds?: string[] },
) {
  let query = supabase
    .from("entries")
    .select(
      "id, project_id, author_id, title, dek, entry_date, body, status, published_at, updated_at, created_at, " +
        "projects!inner(name), " +
        "entry_people(person_id, role, people!inner(id, full_name)), " +
        "entry_groups(group_id, groups!inner(id, name)), " +
        "entry_tags(tag_id, tags!inner(id, name))",
    );
  if (opts.projectId) query = query.eq("project_id", opts.projectId);
  if (opts.status) query = query.eq("status", opts.status);
  if (opts.authorId) query = query.eq("author_id", opts.authorId);
  if (opts.entryIds) query = query.in("id", opts.entryIds);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as any[];

  const authorIds = Array.from(new Set(rows.map((r) => r.author_id).filter(Boolean)));
  const profileMap = new Map<string, { full_name: string | null; email: string | null }>();
  if (authorIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .in("id", authorIds);
    for (const p of (profiles ?? []) as any[]) {
      profileMap.set(p.id, { full_name: p.full_name, email: p.email });
    }
  }

  return rows.map((r): EntryListItem => {
    const p = profileMap.get(r.author_id);
    const allPeople = (r.entry_people ?? []).map((ep: any) => ({
      id: ep.people.id,
      fullName: ep.people.full_name,
      role: ep.role as "participant" | "mentioned",
    }));
    return {
      id: r.id,
      projectId: r.project_id,
      projectName: r.projects?.name ?? "",
      authorId: r.author_id,
      authorName: p?.full_name ?? p?.email ?? null,
      title: r.title,
      dek: r.dek ?? null,
      entryDate: r.entry_date,
      body: r.body ?? "",
      status: r.status,
      publishedAt: r.published_at,
      updatedAt: r.updated_at,
      createdAt: r.created_at,
      people: allPeople.map((x: { id: string; fullName: string }) => ({ id: x.id, fullName: x.fullName })),
      participants: allPeople
        .filter((x: any) => x.role === "participant")
        .map((x: any) => ({ id: x.id, fullName: x.fullName })),
      mentioned: allPeople
        .filter((x: any) => x.role === "mentioned")
        .map((x: any) => ({ id: x.id, fullName: x.fullName })),
      groups: (r.entry_groups ?? []).map((eg: any) => ({ id: eg.groups.id, name: eg.groups.name })),
      tags: (r.entry_tags ?? []).map((et: any) => ({ id: et.tags.id, name: et.tags.name })),
    };
  });
}

export const listProjectEntries = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ projectId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const all = await loadEntries(context.supabase, { projectId: data.projectId });
    const published = all
      .filter((e) => e.status === "published")
      .sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));
    const myDrafts = all
      .filter((e) => e.status === "draft" && e.authorId === context.userId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return { published, myDrafts };
  });

export const listFilteredEntries = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        projectId: z.string().uuid(),
        tagIds: z.array(z.string().uuid()).optional(),
        groupIds: z.array(z.string().uuid()).optional(),
        from: z.string().nullable().optional(),
        to: z.string().nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    let q = supabase
      .from("entries")
      .select("id")
      .eq("project_id", data.projectId)
      .eq("status", "published");
    if (data.from) q = q.gte("published_at", data.from);
    if (data.to) q = q.lte("published_at", data.to);
    const { data: idsRows } = await q;
    let entryIds = (idsRows ?? []).map((r: any) => r.id as string);

    if (data.tagIds?.length && entryIds.length > 0) {
      const { data: hit } = await supabase
        .from("entry_tags")
        .select("entry_id")
        .in("tag_id", data.tagIds)
        .in("entry_id", entryIds);
      const ok = new Set(((hit ?? []) as any[]).map((r) => r.entry_id as string));
      entryIds = entryIds.filter((id) => ok.has(id));
    }
    if (data.groupIds?.length && entryIds.length > 0) {
      const { data: hit } = await supabase
        .from("entry_groups")
        .select("entry_id")
        .in("group_id", data.groupIds)
        .in("entry_id", entryIds);
      const ok = new Set(((hit ?? []) as any[]).map((r) => r.entry_id as string));
      entryIds = entryIds.filter((id) => ok.has(id));
    }


    if (entryIds.length === 0) return [];
    const list = await loadEntries(supabase, { entryIds });
    return list.sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));
  });

export const listGroupEntries = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ projectId: z.string().uuid(), groupId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: links } = await context.supabase
      .from("entry_groups")
      .select("entry_id")
      .eq("group_id", data.groupId);
    const ids = (links ?? []).map((r: any) => r.entry_id as string);
    if (ids.length === 0) return [];
    const list = await loadEntries(context.supabase, { entryIds: ids });
    return list
      .filter((e) => e.status === "published")
      .sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));
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
    const list = await loadEntries(context.supabase, { entryIds: [data.id] });
    const row = list[0];
    if (!row) throw new Error("Not found");
    return row;
  });

export const createDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ projectId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const today = new Date().toISOString().slice(0, 10);
    const { data: row, error } = await context.supabase
      .from("entries")
      .insert({
        project_id: data.projectId,
        author_id: context.userId,
        title: "Untitled",
        body: "",
        status: "draft",
        entry_date: today,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

const UpdateInput = z.object({
  id: z.string().uuid(),
  title: z.string().max(500).optional(),
  dek: z.string().max(500).nullable().optional(),
  entryDate: z.string().nullable().optional(),
  body: z.string().max(50000).optional(),
  peopleIds: z.array(z.string().uuid()).optional(),
  mentionedPeopleIds: z.array(z.string().uuid()).optional(),
  groupIds: z.array(z.string().uuid()).optional(),
  tagIds: z.array(z.string().uuid()).optional(),
});

async function syncEntryPeople(
  supabase: any,
  entryId: string,
  participants: string[] | undefined,
  mentioned: string[] | undefined,
) {
  if (participants === undefined && mentioned === undefined) return;
  const { data: existing } = await supabase
    .from("entry_people")
    .select("person_id, role")
    .eq("entry_id", entryId);
  const existingMap = new Map<string, string>();
  ((existing ?? []) as any[]).forEach((r) => existingMap.set(r.person_id, r.role));

  // Build desired set: participants win over mentioned.
  const desired = new Map<string, string>();
  // If undefined, keep existing of that role
  if (participants !== undefined) {
    participants.forEach((p) => desired.set(p, "participant"));
  } else {
    for (const [pid, role] of existingMap.entries()) if (role === "participant") desired.set(pid, "participant");
  }
  if (mentioned !== undefined) {
    mentioned.forEach((p) => {
      if (!desired.has(p)) desired.set(p, "mentioned");
    });
  } else {
    for (const [pid, role] of existingMap.entries()) if (role === "mentioned" && !desired.has(pid)) desired.set(pid, "mentioned");
  }

  const toRemove: string[] = [];
  for (const pid of existingMap.keys()) if (!desired.has(pid)) toRemove.push(pid);
  if (toRemove.length > 0) {
    await supabase.from("entry_people").delete().eq("entry_id", entryId).in("person_id", toRemove);
  }
  const toInsert: { entry_id: string; person_id: string; role: string }[] = [];
  const toUpdate: { person_id: string; role: string }[] = [];
  for (const [pid, role] of desired.entries()) {
    const cur = existingMap.get(pid);
    if (cur === undefined) toInsert.push({ entry_id: entryId, person_id: pid, role });
    else if (cur !== role) toUpdate.push({ person_id: pid, role });
  }
  if (toInsert.length > 0) await supabase.from("entry_people").insert(toInsert);
  for (const u of toUpdate) {
    await supabase
      .from("entry_people")
      .update({ role: u.role })
      .eq("entry_id", entryId)
      .eq("person_id", u.person_id);
  }
}

async function syncEntryLinks(
  supabase: any,
  entryId: string,
  table: "entry_groups" | "entry_tags",
  fkCol: "group_id" | "tag_id",
  ids: string[] | undefined,
) {
  if (ids === undefined) return;
  const { data: existing } = await supabase.from(table).select(fkCol).eq("entry_id", entryId);
  const have = new Set(((existing ?? []) as any[]).map((r) => r[fkCol] as string));
  const want = new Set(ids);
  const toAdd = [...want].filter((x) => !have.has(x));
  const toRemove = [...have].filter((x) => !want.has(x));
  if (toAdd.length > 0) {
    await supabase.from(table).insert(toAdd.map((v) => ({ entry_id: entryId, [fkCol]: v })));
  }
  if (toRemove.length > 0) {
    await supabase.from(table).delete().eq("entry_id", entryId).in(fkCol, toRemove);
  }
}

export const updateDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => UpdateInput.parse(input))
  .handler(async ({ data, context }) => {
    const patch: any = {};
    if (data.title !== undefined) patch.title = data.title.trim() || "Untitled";
    if (data.dek !== undefined) patch.dek = data.dek?.trim() ? data.dek.trim() : null;
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
    await syncEntryPeople(context.supabase, data.id, data.peopleIds, data.mentionedPeopleIds);
    await syncEntryLinks(context.supabase, data.id, "entry_groups", "group_id", data.groupIds);
    await syncEntryLinks(context.supabase, data.id, "entry_tags", "tag_id", data.tagIds);
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

export const duplicateDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: src, error } = await supabase
      .from("entries")
      .select("project_id, title, dek, entry_date, body")
      .eq("id", data.id)
      .maybeSingle();
    if (error || !src) throw new Error("Not found");

    const { data: copy, error: cErr } = await supabase
      .from("entries")
      .insert({
        project_id: src.project_id,
        author_id: context.userId,
        title: src.title ? `${src.title} (copy)` : "Untitled",
        dek: src.dek ?? null,
        entry_date: src.entry_date,
        body: src.body ?? "",
        status: "draft",
      })
      .select("id")
      .single();
    if (cErr) throw new Error(cErr.message);

    const [{ data: ppl }, { data: grp }, { data: tg }] = await Promise.all([
      supabase.from("entry_people").select("person_id, role").eq("entry_id", data.id),
      supabase.from("entry_groups").select("group_id").eq("entry_id", data.id),
      supabase.from("entry_tags").select("tag_id").eq("entry_id", data.id),
    ]);
    if (ppl?.length) {
      await supabase
        .from("entry_people")
        .insert(ppl.map((r: any) => ({ entry_id: copy.id, person_id: r.person_id, role: r.role })));
    }
    if (grp?.length) {
      await supabase
        .from("entry_groups")
        .insert(grp.map((r: any) => ({ entry_id: copy.id, group_id: r.group_id })));
    }
    if (tg?.length) {
      await supabase
        .from("entry_tags")
        .insert(tg.map((r: any) => ({ entry_id: copy.id, tag_id: r.tag_id })));
    }
    return { id: copy.id };
  });
