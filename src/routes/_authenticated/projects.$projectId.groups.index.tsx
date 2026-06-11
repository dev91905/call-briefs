import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import {
  listProjectGroups,
  createGroup,
  renameGroup,
  deleteGroup,
} from "@/lib/groups.functions";
import { getProject } from "@/lib/projects.functions";
import { relativeTime } from "@/lib/format";
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
} from "@/components/ui/context-menu";

export const Route = createFileRoute("/_authenticated/projects/$projectId/groups/")({
  component: GroupsTab,
});

function GroupsTab() {
  const { projectId } = Route.useParams();
  const qc = useQueryClient();
  const list = useQuery({
    queryKey: ["project-groups", projectId],
    queryFn: () => listProjectGroups({ data: { projectId } }),
  });
  const project = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => getProject({ data: { id: projectId } }),
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
  const canManage = project.data?.myRole === "owner" || project.data?.myRole === "co_owner";

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
            <GroupCard key={g.id} projectId={projectId} group={g} canManage={canManage} />
          ))}
        </div>
      )}
    </div>
  );
}

function GroupCard({
  projectId,
  group,
  canManage,
}: {
  projectId: string;
  group: { id: string; name: string; entryCount: number; lastActivity: string | null };
  canManage: boolean;
}) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(group.name);

  const rename = useMutation({
    mutationFn: useServerFn(renameGroup),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project-groups", projectId] });
      setRenaming(false);
    },
  });
  const remove = useMutation({
    mutationFn: useServerFn(deleteGroup),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["project-groups", projectId] }),
  });

  if (renaming) {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const v = name.trim();
          if (v) rename.mutate({ data: { projectId, groupId: group.id, name: v } });
        }}
        className="rounded-xl p-5"
        style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
      >
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => setRenaming(false)}
          className="block w-full bg-transparent text-[15px] font-medium outline-none"
          style={{ color: "var(--text)" }}
        />
      </form>
    );
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <Link
          to="/projects/$projectId/groups/$groupId"
          params={{ projectId, groupId: group.id }}
          className="block rounded-xl p-5"
          style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
        >
          <h3 className="text-[15px] font-medium" style={{ color: "var(--text)" }}>{group.name}</h3>
          <p className="mt-1 text-[12px]" style={{ color: "var(--text-faint)" }}>
            {group.entryCount} {group.entryCount === 1 ? "entry" : "entries"}
            {group.lastActivity ? ` · last ${relativeTime(group.lastActivity)}` : ""}
          </p>
        </Link>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem
          onSelect={() =>
            navigate({ to: "/projects/$projectId/groups/$groupId", params: { projectId, groupId: group.id } })
          }
        >
          Open
        </ContextMenuItem>
        {canManage && (
          <>
            <ContextMenuItem onSelect={() => { setName(group.name); setRenaming(true); }}>
              Rename
            </ContextMenuItem>
            <ContextMenuItem
              onSelect={() => {
                if (confirm(`Delete group "${group.name}"? Entries themselves are untouched.`)) {
                  remove.mutate({ data: { projectId, groupId: group.id } });
                }
              }}
            >
              Delete
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}
