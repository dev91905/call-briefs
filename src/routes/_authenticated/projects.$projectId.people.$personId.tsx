import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getPersonDetail, deletePerson } from "@/lib/people.functions";
import { getProject } from "@/lib/projects.functions";
import { formatCallDate } from "@/lib/format";
import { ProjectEntryCard } from "@/components/portal/ProjectEntryCard";

export const Route = createFileRoute("/_authenticated/projects/$projectId/people/$personId")({
  component: PersonDetailPage,
});

function PersonDetailPage() {
  const { projectId, personId } = Route.useParams();
  const qc = useQueryClient();
  const router = useRouter();

  const project = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => getProject({ data: { id: projectId } }),
  });
  const q = useQuery({
    queryKey: ["person", projectId, personId],
    queryFn: () => getPersonDetail({ data: { projectId, personId } }),
  });

  const remove = useMutation({
    mutationFn: useServerFn(deletePerson),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project-people", projectId] });
      qc.invalidateQueries({ queryKey: ["project-graph", projectId] });
      router.navigate({ to: "/projects/$projectId/people", params: { projectId } });
    },
  });

  if (q.isLoading) return <p className="text-[13px]" style={{ color: "var(--text-faint)" }}>Loading…</p>;
  if (q.error || !q.data) return <p className="text-[13px]" style={{ color: "var(--text-faint)" }}>Not found.</p>;

  const canManage = project.data?.myRole === "owner" || project.data?.myRole === "co_owner";

  return (
    <div className="mx-auto max-w-[620px]">
      <Link
        to="/projects/$projectId/people"
        params={{ projectId }}
        className="text-[12px]"
        style={{ color: "var(--text-faint)" }}
      >
        ← People
      </Link>
      <div className="mt-3 flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-[22px] font-medium" style={{ color: "var(--text)" }}>{q.data.fullName}</h2>
            {q.data.groups.map((group: { id: string; name: string }) => (
              <Link
                key={group.id}
                to="/projects/$projectId/groups/$groupId"
                params={{ projectId, groupId: group.id }}
                className="inline-flex h-5 items-center rounded-full px-2 text-[10px]"
                style={{
                  background: "var(--surface-raised)",
                  border: "1px solid var(--border)",
                  color: "var(--text-muted)",
                }}
              >
                {group.name}
              </Link>
            ))}
          </div>
          <div className="mt-2 text-[12px]" style={{ color: "var(--text-faint)" }}>
            First seen {formatCallDate(q.data.firstSeen)}
            {q.data.addedBy ? ` · added by ${q.data.addedBy}` : ""}
            {` · in ${q.data.entryCount} ${q.data.entryCount === 1 ? "entry" : "entries"}`}
          </div>
        </div>
        {canManage && (
          <button
            onClick={() => {
              const n = q.data.entries.length;
              if (
                confirm(
                  `Removes ${q.data.fullName} and their tags from ${n} ${n === 1 ? "entry" : "entries"}. The entries themselves are untouched.`,
                )
              ) {
                remove.mutate({ data: { projectId, personId } });
              }
            }}
            className="text-[12px]"
            style={{ color: "var(--text-faint)" }}
          >
            Delete
          </button>
        )}
      </div>

      {q.data.connections.length > 0 && (
        <div className="mt-5 text-[13px]" style={{ color: "var(--text-muted)" }}>
          <span className="mr-2" style={{ color: "var(--text-faint)" }}>Knows</span>
          {q.data.connections.map((c, i) => (
            <span key={c.id} className="inline-flex items-center gap-1">
              {i > 0 && <span style={{ color: "var(--text-faint)" }}>·</span>}
              <Link
                to="/projects/$projectId/people/$personId"
                params={{ projectId, personId: c.id }}
                className="ref-link"
              >
                {c.fullName}
              </Link>
              <span style={{ color: "var(--text-faint)" }}>{c.sharedCount}</span>
              {c.mentionOnly && <span style={{ color: "var(--text-faint)" }}>· mentioned</span>}
            </span>
          ))}
        </div>
      )}

      <section className="mt-8">
        <div
          className="mb-3 text-[11px] font-medium uppercase tracking-wider"
          style={{ color: "var(--text-faint)" }}
        >
          Appears in
        </div>
        {q.data.entries.length === 0 ? (
          <p className="text-[13px]" style={{ color: "var(--text-faint)" }}>No published entries yet.</p>
        ) : (
          <div className="space-y-4">
            {q.data.entries.map((e: any) => (
              <ProjectEntryCard key={e.id} e={e} personRole={e.role} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
