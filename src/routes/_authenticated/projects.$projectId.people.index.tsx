import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { listProjectPeople, renamePerson, deletePerson } from "@/lib/people.functions";
import { getProject } from "@/lib/projects.functions";
import { relativeTime } from "@/lib/format";
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
} from "@/components/ui/context-menu";

export const Route = createFileRoute("/_authenticated/projects/$projectId/people/")({
  component: PeopleTab,
});

function PeopleTab() {
  const { projectId } = Route.useParams();
  const people = useQuery({
    queryKey: ["project-people", projectId],
    queryFn: () => listProjectPeople({ data: { projectId } }),
  });
  const project = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => getProject({ data: { id: projectId } }),
  });

  if (people.isLoading) return <p className="text-[13px]" style={{ color: "var(--text-faint)" }}>Loading…</p>;
  const list = people.data ?? [];
  const canManage = project.data?.myRole === "owner" || project.data?.myRole === "co_owner";

  if (list.length === 0) {
    return (
      <div className="rounded-xl p-10 text-center" style={{ background: "var(--surface)" }}>
        <p className="text-[14px]" style={{ color: "var(--text-muted)" }}>
          People are added automatically when you tag participants in entries.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      {list.map((p) => (
        <PersonCard key={p.id} projectId={projectId} person={p} canManage={canManage} />
      ))}
    </div>
  );
}

function PersonCard({
  projectId,
  person,
  canManage,
}: {
  projectId: string;
  person: { id: string; fullName: string; entryCount: number; lastSeen: string | null };
  canManage: boolean;
}) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(person.fullName);

  const rename = useMutation({
    mutationFn: useServerFn(renamePerson),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project-people", projectId] });
      qc.invalidateQueries({ queryKey: ["project-graph", projectId] });
      setRenaming(false);
    },
  });
  const remove = useMutation({
    mutationFn: useServerFn(deletePerson),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project-people", projectId] });
      qc.invalidateQueries({ queryKey: ["project-graph", projectId] });
    },
  });

  if (renaming) {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const v = name.trim();
          if (v) rename.mutate({ data: { projectId, personId: person.id, fullName: v } });
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
          to="/projects/$projectId/people/$personId"
          params={{ projectId, personId: person.id }}
          className="block rounded-xl p-5"
          style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
        >
          <h3 className="text-[15px] font-medium" style={{ color: "var(--text)" }}>{person.fullName}</h3>
          <p className="mt-1 text-[12px]" style={{ color: "var(--text-faint)" }}>
            in {person.entryCount} {person.entryCount === 1 ? "entry" : "entries"}
            {person.lastSeen ? ` · last ${relativeTime(person.lastSeen)}` : ""}
          </p>
        </Link>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem
          onSelect={() =>
            navigate({ to: "/projects/$projectId/people/$personId", params: { projectId, personId: person.id } })
          }
        >
          Open
        </ContextMenuItem>
        {canManage && (
          <>
            <ContextMenuItem onSelect={() => { setName(person.fullName); setRenaming(true); }}>
              Rename
            </ContextMenuItem>
            <ContextMenuItem
              onSelect={() => {
                if (
                  confirm(
                    `Removes ${person.fullName} and their tags from ${person.entryCount} ${person.entryCount === 1 ? "entry" : "entries"}. The entries themselves are untouched.`,
                  )
                ) {
                  remove.mutate({ data: { projectId, personId: person.id } });
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
