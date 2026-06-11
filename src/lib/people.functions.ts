import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertMember(supabase: any, userId: string, portalId: string) {
  const { data } = await supabase.rpc("is_portal_member", { _user: userId, _portal: portalId });
  if (!data) throw new Error("Forbidden");
}

export const listPeople = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ portalId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase, context.userId, data.portalId);
    const { data: people, error } = await context.supabase
      .from("portal_people")
      .select("id, name, org, title, email, notes, created_at")
      .eq("portal_id", data.portalId)
      .order("name");
    if (error) throw new Error(error.message);
    // mention counts
    const ids = (people ?? []).map((p: any) => p.id);
    let counts = new Map<string, number>();
    if (ids.length) {
      const { data: mentions } = await context.supabase
        .from("portal_entry_mentions")
        .select("person_id")
        .in("person_id", ids);
      (mentions ?? []).forEach((m: any) => counts.set(m.person_id, (counts.get(m.person_id) ?? 0) + 1));
    }
    return (people ?? []).map((p: any) => ({ ...p, mentionCount: counts.get(p.id) ?? 0 }));
  });

export const getPerson = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ portalId: z.string().uuid(), personId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase, context.userId, data.portalId);
    const { data: person, error } = await context.supabase
      .from("portal_people")
      .select("id, name, org, title, email, notes")
      .eq("id", data.personId)
      .eq("portal_id", data.portalId)
      .single();
    if (error) throw new Error(error.message);

    const { data: entries } = await context.supabase
      .from("portal_entries")
      .select("id, readout, created_at, subject:subject_person_id(name)")
      .eq("portal_id", data.portalId)
      .or(`subject_person_id.eq.${data.personId}`)
      .order("created_at", { ascending: false })
      .limit(20);

    const { data: rels } = await context.supabase
      .from("portal_relationships")
      .select("id, type, note, from_person_id, to_person_id, from:from_person_id(name), to:to_person_id(name)")
      .eq("portal_id", data.portalId)
      .or(`from_person_id.eq.${data.personId},to_person_id.eq.${data.personId}`);

    return { person, entries: entries ?? [], relationships: rels ?? [] };
  });

export const updatePerson = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        portalId: z.string().uuid(),
        personId: z.string().uuid(),
        name: z.string().trim().min(1).max(200).optional(),
        org: z.string().trim().max(200).nullable().optional(),
        title: z.string().trim().max(200).nullable().optional(),
        email: z.string().trim().max(255).nullable().optional(),
        notes: z.string().trim().max(4000).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase, context.userId, data.portalId);
    const patch: any = {};
    for (const k of ["name", "org", "title", "email", "notes"] as const) {
      if ((data as any)[k] !== undefined) patch[k] = (data as any)[k];
    }
    const { error } = await context.supabase.from("portal_people").update(patch).eq("id", data.personId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const addRelationship = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        portalId: z.string().uuid(),
        fromPersonId: z.string().uuid(),
        toName: z.string().trim().min(1).max(200),
        type: z.string().trim().min(1).max(60),
        note: z.string().trim().max(500).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase, context.userId, data.portalId);
    // upsert target person
    const { data: existing } = await context.supabase
      .from("portal_people")
      .select("id")
      .eq("portal_id", data.portalId)
      .ilike("name", data.toName)
      .maybeSingle();
    let toId = existing?.id;
    if (!toId) {
      const { data: created, error } = await context.supabase
        .from("portal_people")
        .insert({ portal_id: data.portalId, name: data.toName, created_by: context.userId })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      toId = created.id;
    }
    if (toId === data.fromPersonId) throw new Error("Cannot relate a person to themselves.");
    const { error } = await context.supabase.from("portal_relationships").insert({
      portal_id: data.portalId,
      from_person_id: data.fromPersonId,
      to_person_id: toId,
      type: data.type,
      note: data.note ?? null,
      created_by: context.userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const removeRelationship = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ portalId: z.string().uuid(), id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase, context.userId, data.portalId);
    const { error } = await context.supabase.from("portal_relationships").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getGraph = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ portalId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase, context.userId, data.portalId);
    const { data: people } = await context.supabase
      .from("portal_people")
      .select("id, name, org")
      .eq("portal_id", data.portalId);
    const { data: rels } = await context.supabase
      .from("portal_relationships")
      .select("id, from_person_id, to_person_id, type")
      .eq("portal_id", data.portalId);

    // Co-mention edges
    const { data: entries } = await context.supabase
      .from("portal_entries")
      .select("id, subject_person_id, mentions:portal_entry_mentions(person_id)")
      .eq("portal_id", data.portalId);

    const coCounts = new Map<string, number>();
    (entries ?? []).forEach((e: any) => {
      const ids = new Set<string>();
      if (e.subject_person_id) ids.add(e.subject_person_id);
      (e.mentions ?? []).forEach((m: any) => ids.add(m.person_id));
      const arr = Array.from(ids).sort();
      for (let i = 0; i < arr.length; i++) {
        for (let j = i + 1; j < arr.length; j++) {
          const k = `${arr[i]}|${arr[j]}`;
          coCounts.set(k, (coCounts.get(k) ?? 0) + 1);
        }
      }
    });

    const mentionCounts = new Map<string, number>();
    (entries ?? []).forEach((e: any) => {
      const ids = new Set<string>();
      if (e.subject_person_id) ids.add(e.subject_person_id);
      (e.mentions ?? []).forEach((m: any) => ids.add(m.person_id));
      ids.forEach((id) => mentionCounts.set(id, (mentionCounts.get(id) ?? 0) + 1));
    });

    const nodes = (people ?? []).map((p: any) => ({
      id: p.id,
      name: p.name,
      org: p.org,
      weight: mentionCounts.get(p.id) ?? 0,
    }));

    const links = [
      ...(rels ?? []).map((r: any) => ({
        source: r.from_person_id,
        target: r.to_person_id,
        type: r.type,
        kind: "rel" as const,
      })),
      ...Array.from(coCounts.entries()).map(([k, count]) => {
        const [s, t] = k.split("|");
        return { source: s, target: t, type: "co-mention", count, kind: "co" as const };
      }),
    ];

    return { nodes, links };
  });
