import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type EntryListItem = {
  id: string;
  portalId: string;
  portalName?: string;
  subjectPersonId: string | null;
  subjectName: string | null;
  talkedTo: string | null;
  readout: any;
  callDate: string | null;
  custom: Record<string, any>;
  authorId: string | null;
  authorEmail: string | null;
  createdAt: string;
  updatedAt: string;
  mentions: { id: string; name: string }[];
};

async function assertMember(supabase: any, userId: string, portalId: string) {
  const { data } = await supabase.rpc("is_portal_member", { _user: userId, _portal: portalId });
  if (!data) throw new Error("Forbidden");
}

export const listPortalEntries = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ portalId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<EntryListItem[]> => {
    await assertMember(context.supabase, context.userId, data.portalId);
    const { data: rows, error } = await context.supabase
      .from("portal_entries")
      .select(
        "id, portal_id, subject_person_id, talked_to, readout, call_date, custom, author_id, created_at, updated_at, subject:subject_person_id(name), mentions:portal_entry_mentions(person:person_id(id, name))",
      )
      .eq("portal_id", data.portalId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    const authorIds = Array.from(new Set((rows ?? []).map((r: any) => r.author_id).filter(Boolean)));
    const { data: authors } = authorIds.length
      ? await context.supabase.from("profiles").select("id, email").in("id", authorIds)
      : { data: [] };
    const amap = new Map((authors ?? []).map((a: any) => [a.id, a.email]));

    return (rows ?? []).map((r: any) => ({
      id: r.id,
      portalId: r.portal_id,
      subjectPersonId: r.subject_person_id,
      subjectName: r.subject?.name ?? null,
      talkedTo: r.talked_to,
      readout: r.readout,
      callDate: r.call_date,
      custom: r.custom ?? {},
      authorId: r.author_id,
      authorEmail: amap.get(r.author_id) ?? null,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      mentions: (r.mentions ?? []).map((m: any) => ({ id: m.person.id, name: m.person.name })),
    }));
  });

const EntryInput = z.object({
  portalId: z.string().uuid(),
  subjectName: z.string().trim().min(1).max(200),
  talkedTo: z.string().trim().max(500).optional().nullable(),
  readout: z.any().optional(),
  callDate: z.string().optional().nullable(),
  custom: z.record(z.string(), z.any()).optional(),
  mentionNames: z.array(z.string().trim().min(1).max(200)).optional(),
});

async function upsertPersonByName(supabase: any, portalId: string, userId: string, name: string) {
  const trimmed = name.trim();
  const { data: existing } = await supabase
    .from("portal_people")
    .select("id")
    .eq("portal_id", portalId)
    .ilike("name", trimmed)
    .maybeSingle();
  if (existing) return existing.id as string;
  const { data: created, error } = await supabase
    .from("portal_people")
    .insert({ portal_id: portalId, name: trimmed, created_by: userId })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return created.id as string;
}

export const createEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => EntryInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase, context.userId, data.portalId);
    const subjectId = await upsertPersonByName(context.supabase, data.portalId, context.userId, data.subjectName);

    const { data: entry, error } = await context.supabase
      .from("portal_entries")
      .insert({
        portal_id: data.portalId,
        subject_person_id: subjectId,
        talked_to: data.talkedTo ?? null,
        readout: data.readout ?? null,
        call_date: data.callDate || null,
        custom: data.custom ?? {},
        author_id: context.userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    const mentionIds = new Set<string>();
    for (const m of data.mentionNames ?? []) {
      const id = await upsertPersonByName(context.supabase, data.portalId, context.userId, m);
      if (id !== subjectId) mentionIds.add(id);
    }
    if (mentionIds.size > 0) {
      await context.supabase
        .from("portal_entry_mentions")
        .insert(Array.from(mentionIds).map((person_id) => ({ entry_id: entry.id, person_id })));
    }
    return { id: entry.id };
  });

export const updateEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    EntryInput.partial({ subjectName: true }).extend({ id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase, context.userId, data.portalId);
    const patch: any = {};
    if (data.talkedTo !== undefined) patch.talked_to = data.talkedTo;
    if (data.readout !== undefined) patch.readout = data.readout;
    if (data.callDate !== undefined) patch.call_date = data.callDate || null;
    if (data.custom !== undefined) patch.custom = data.custom;
    if (data.subjectName) {
      patch.subject_person_id = await upsertPersonByName(
        context.supabase,
        data.portalId,
        context.userId,
        data.subjectName,
      );
    }
    const { error } = await context.supabase.from("portal_entries").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);

    if (data.mentionNames) {
      await context.supabase.from("portal_entry_mentions").delete().eq("entry_id", data.id);
      const ids = new Set<string>();
      for (const m of data.mentionNames) {
        ids.add(await upsertPersonByName(context.supabase, data.portalId, context.userId, m));
      }
      if (ids.size > 0) {
        await context.supabase
          .from("portal_entry_mentions")
          .insert(Array.from(ids).map((person_id) => ({ entry_id: data.id, person_id })));
      }
    }
    return { ok: true };
  });

export const deleteEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ portalId: z.string().uuid(), id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase, context.userId, data.portalId);
    const { error } = await context.supabase.from("portal_entries").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Unified activity feed across all portals the user belongs to
export const listActivity = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: memberships } = await supabase
      .from("portal_members")
      .select("portal_id, portals:portal_id(name)")
      .eq("user_id", userId);
    const portalIds = (memberships ?? []).map((m: any) => m.portal_id);
    const portalNames = new Map((memberships ?? []).map((m: any) => [m.portal_id, m.portals?.name ?? ""]));
    if (portalIds.length === 0) return [];

    const { data: entries } = await supabase
      .from("portal_entries")
      .select("id, portal_id, subject:subject_person_id(name), readout, created_at, author_id")
      .in("portal_id", portalIds)
      .order("created_at", { ascending: false })
      .limit(50);

    const { data: requests } = await supabase
      .from("portal_requests")
      .select("id, portal_id, subject, body, status, created_at, created_by")
      .in("portal_id", portalIds)
      .order("created_at", { ascending: false })
      .limit(50);

    const items = [
      ...(entries ?? []).map((e: any) => ({
        type: "intel" as const,
        id: e.id,
        portalId: e.portal_id,
        portalName: portalNames.get(e.portal_id) ?? "",
        title: e.subject?.name ?? "(no subject)",
        preview: extractText(e.readout).slice(0, 140),
        createdAt: e.created_at,
      })),
      ...(requests ?? []).map((r: any) => ({
        type: "request" as const,
        id: r.id,
        portalId: r.portal_id,
        portalName: portalNames.get(r.portal_id) ?? "",
        title: r.subject,
        preview: (r.body ?? "").slice(0, 140),
        status: r.status,
        createdAt: r.created_at,
      })),
    ].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    return items;
  });

function extractText(doc: any): string {
  if (!doc) return "";
  if (typeof doc === "string") return doc;
  if (Array.isArray(doc)) return doc.map(extractText).join(" ");
  if (typeof doc === "object") {
    if (typeof doc.text === "string") return doc.text;
    if (doc.content) return extractText(doc.content);
  }
  return "";
}
