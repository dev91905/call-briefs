import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type GraphNode = {
  id: string;
  fullName: string;
  initials: string;
  mentionOnly: boolean;
};
export type GraphEdge = {
  source: string;
  target: string;
  weight: number;
  mentionOnly: boolean;
};

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("");
}

export const getProjectGraph = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        projectId: z.string().uuid(),
        tagId: z.string().uuid().nullable().optional(),
        range: z.enum(["all", "90d", "30d"]).default("all"),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    let from: string | null = null;
    if (data.range === "30d") from = new Date(Date.now() - 30 * 86400_000).toISOString();
    if (data.range === "90d") from = new Date(Date.now() - 90 * 86400_000).toISOString();

    let q = supabase
      .from("entries")
      .select("id")
      .eq("project_id", data.projectId)
      .eq("status", "published");
    if (from) q = q.gte("published_at", from);
    const { data: entryRows, error: eErr } = await q;
    if (eErr) throw new Error(eErr.message);
    let entryIds = (entryRows ?? []).map((r: any) => r.id as string);

    if (data.tagId && entryIds.length > 0) {
      const { data: tagged } = await supabase
        .from("entry_tags")
        .select("entry_id")
        .eq("tag_id", data.tagId)
        .in("entry_id", entryIds);
      const set = new Set((tagged ?? []).map((r: any) => r.entry_id as string));
      entryIds = entryIds.filter((id) => set.has(id));
    }
    if (entryIds.length === 0) return { nodes: [] as GraphNode[], edges: [] as GraphEdge[] };

    const { data: links } = await supabase
      .from("entry_people")
      .select("entry_id, person_id, role, people!inner(id, full_name)")
      .in("entry_id", entryIds);

    // Group by entry
    const byEntry = new Map<string, { personId: string; role: string; name: string }[]>();
    const names = new Map<string, string>();
    const allRoles = new Map<string, Set<string>>();
    ((links ?? []) as any[]).forEach((l) => {
      const arr = byEntry.get(l.entry_id) ?? [];
      arr.push({ personId: l.person_id, role: l.role, name: l.people.full_name });
      byEntry.set(l.entry_id, arr);
      names.set(l.person_id, l.people.full_name);
      const r = allRoles.get(l.person_id) ?? new Set();
      r.add(l.role);
      allRoles.set(l.person_id, r);
    });

    const nodes: GraphNode[] = [];
    for (const [pid, name] of names.entries()) {
      const roles = allRoles.get(pid) ?? new Set();
      nodes.push({
        id: pid,
        fullName: name,
        initials: initialsOf(name),
        mentionOnly: roles.size === 1 && roles.has("mentioned"),
      });
    }

    // Edges: co-occurrence per entry
    const edgeMap = new Map<string, GraphEdge>();
    for (const arr of byEntry.values()) {
      for (let i = 0; i < arr.length; i++) {
        for (let j = i + 1; j < arr.length; j++) {
          const a = arr[i].personId;
          const b = arr[j].personId;
          const [s, t] = a < b ? [a, b] : [b, a];
          const key = `${s}|${t}`;
          const allMention = arr[i].role === "mentioned" && arr[j].role === "mentioned";
          const cur = edgeMap.get(key);
          if (cur) {
            cur.weight += 1;
            if (!allMention) cur.mentionOnly = false;
          } else {
            edgeMap.set(key, { source: s, target: t, weight: 1, mentionOnly: allMention });
          }
        }
      }
    }
    return { nodes, edges: Array.from(edgeMap.values()) };
  });
