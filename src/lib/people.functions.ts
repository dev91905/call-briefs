import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadEntries } from "@/lib/entries.functions";

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
    const { supabase } = context;
    const { data: person, error } = await supabase
      .from("people")
      .select("id, full_name, project_id, created_at, created_by")
      .eq("id", data.personId)
      .eq("project_id", data.projectId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!person) throw new Error("Not found");

    const { data: links } = await supabase
      .from("entry_people")
      .select("entry_id, role, entries!inner(id, title, entry_date, body, status, published_at, author_id)")
      .eq("person_id", data.personId);

    const publishedLinks = ((links ?? []) as any[]).filter((l) => l.entries && l.entries.status === "published");
    const publishedEntries = publishedLinks.map((l) => l.entries);
    const entryIds = publishedEntries.map((e: any) => e.id);
    const roleByEntryId = new Map<string, "participant" | "mentioned">();
    publishedLinks.forEach((l) => roleByEntryId.set(l.entry_id, l.role));

    const authorIds = Array.from(
      new Set([
        ...publishedEntries.map((e: any) => e.author_id).filter(Boolean),
        person.created_by,
      ].filter(Boolean)),
    );
    const profileMap = new Map<string, { full_name: string | null; email: string | null }>();
    if (authorIds.length > 0) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", authorIds);
      for (const p of (profs ?? []) as any[]) {
        profileMap.set(p.id, { full_name: p.full_name, email: p.email });
      }
    }

    const fullEntries = entryIds.length > 0 ? await loadEntries(supabase, { entryIds }) : [];
    const entries = fullEntries
      .map((e) => ({
        ...e,
        role: roleByEntryId.get(e.id) ?? "participant",
      }))
      .sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));

    // Connections: co-occurrence on published entries.
    const connections: { id: string; fullName: string; mentionOnly: boolean; sharedCount: number }[] = [];
    if (entryIds.length > 0) {
      // role of this person on each entry
      const { data: myLinks } = await supabase
        .from("entry_people")
        .select("entry_id, role")
        .eq("person_id", data.personId)
        .in("entry_id", entryIds);
      const myRoleByEntry = new Map<string, string>();
      ((myLinks ?? []) as any[]).forEach((r) => myRoleByEntry.set(r.entry_id, r.role));

      const { data: coLinks } = await supabase
        .from("entry_people")
        .select("entry_id, person_id, role, people!inner(id, full_name)")
        .in("entry_id", entryIds)
        .neq("person_id", data.personId);

      // For each other person, determine if every shared entry was mention-only on both sides.
      const byPerson = new Map<string, { name: string; allMention: boolean; sharedCount: number }>();
      ((coLinks ?? []) as any[]).forEach((r) => {
        const myRole = myRoleByEntry.get(r.entry_id) ?? "participant";
        const bothMention = myRole === "mentioned" && r.role === "mentioned";
        const cur = byPerson.get(r.person_id);
        if (cur) {
          if (!bothMention) cur.allMention = false;
          cur.sharedCount += 1;
        } else {
          byPerson.set(r.person_id, {
            name: r.people.full_name,
            allMention: bothMention,
            sharedCount: 1,
          });
        }
      });
      for (const [pid, v] of byPerson.entries()) {
        connections.push({ id: pid, fullName: v.name, mentionOnly: v.allMention, sharedCount: v.sharedCount });
      }
      connections.sort((a, b) => a.fullName.localeCompare(b.fullName));
    }

    const creator = person.created_by ? profileMap.get(person.created_by) : null;

    const firstSeen = entries
      .map((entry) => entry.entryDate ?? entry.publishedAt)
      .filter(Boolean)
      .sort((a, b) => (a ?? "").localeCompare(b ?? ""))[0] ?? person.created_at;

    return {
      id: person.id,
      fullName: person.full_name,
      firstSeen,
      addedBy: creator?.full_name ?? creator?.email ?? null,
      entryCount: entries.length,
      entries,
      connections,
      groups: Array.from(new Map(entries.flatMap((e) => e.groups).map((g) => [g.id, g])).values()).sort((a, b) =>
        a.name.localeCompare(b.name),
      ),
    };
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

export const deletePerson = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ projectId: z.string().uuid(), personId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: role } = await context.supabase
      .rpc("project_role_of", { _pid: data.projectId });
    if (role !== "owner" && role !== "co_owner") {
      throw new Error("Only owners or co-owners can remove a person.");
    }
    // RLS already permits owner/co_owner; perform with the user client so policies apply consistently.
    const { error: unlinkErr } = await context.supabase
      .from("entry_people")
      .delete()
      .eq("person_id", data.personId);
    if (unlinkErr) throw new Error(unlinkErr.message);
    const { error } = await context.supabase
      .from("people")
      .delete()
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
