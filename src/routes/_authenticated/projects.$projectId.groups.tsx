import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { listProjectGroups, createGroup } from "@/lib/groups.functions";
import { relativeTime } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/projects/$projectId/groups")({
  component: GroupsTab,
});

function GroupsTab() {
  const { projectId } = Route.useParams();
  const qc = useQueryClient();
  const list = useQuery({
    queryKey: ["project-groups", projectId],
    queryFn: () => listProjectGroups({ data: { projectId } }),
  });
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const create = useMutation({
    mutationFn: useServerFn(createGroup),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project-groups", projectId] });
      setCreating(false);
      setName("");
    },
  });

  if (list.isLoading) return <p className="text-[13px]" style={{ color: "var(--text-faint)" }}>Loading…</p>;
  const groups = list.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-[12px]" style={{ color: "var(--text-faint)" }}>
          Groups collect related intelligence — create one for each working group or workstream.
        </p>
        {!creating ? (
          <button
            onClick={() => setCreating(true)}
            className="text-[13px]"
            style={{ color: "var(--text)" }}
          >
            + New group
          </button>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (name.trim()) create.mutate({ data: { projectId, name: name.trim() } });
            }}
            className="flex items-center gap-2"
          >
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Group name"
              className="rounded-md px-3 py-1.5 text-[13px] outline-none"
              style={{ background: "var(--surface-raised)", border: "1px solid var(--border)", color: "var(--text)" }}
            />
            <button
              type="submit"
              disabled={create.isPending || !name.trim()}
              className="h-8 rounded-md px-3 text-[13px] disabled:opacity-50"
              style={{ background: "var(--text)", color: "#000" }}
            >
              Create
            </button>
            <button
              type="button"
              onClick={() => { setCreating(false); setName(""); }}
              className="text-[12px]"
              style={{ color: "var(--text-faint)" }}
            >
              Cancel
            </button>
          </form>
        )}
      </div>

      {groups.length === 0 ? (
        <div className="rounded-xl p-10 text-center" style={{ background: "var(--surface)" }}>
          <p className="text-[14px]" style={{ color: "var(--text-muted)" }}>
            No groups yet. Groups collect related intelligence — create one for each working group or workstream.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {groups.map((g) => (
            <Link
              key={g.id}
              to="/projects/$projectId/groups/$groupId"
              params={{ projectId, groupId: g.id }}
              className="block rounded-xl p-5"
              style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
            >
              <h3 className="text-[15px] font-medium" style={{ color: "var(--text)" }}>{g.name}</h3>
              <p className="mt-1 text-[12px]" style={{ color: "var(--text-faint)" }}>
                {g.entryCount} {g.entryCount === 1 ? "entry" : "entries"}
                {g.lastActivity ? ` · last ${relativeTime(g.lastActivity)}` : ""}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
