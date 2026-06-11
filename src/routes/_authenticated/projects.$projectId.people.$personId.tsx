import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getPersonDetail, deletePerson } from "@/lib/people.functions";
import { getProject } from "@/lib/projects.functions";
import { MarkdownBody } from "@/components/portal/MarkdownBody";
import { relativeTime, formatCallDate } from "@/lib/format";

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
    <div>
      <Link
        to="/projects/$projectId/people"
        params={{ projectId }}
        className="text-[12px]"
        style={{ color: "var(--text-faint)" }}
      >
        ← People
      </Link>
      <div className="mt-3 mb-6 flex items-start justify-between">
        <h2 className="text-[22px] font-medium" style={{ color: "var(--text)" }}>{q.data.fullName}</h2>
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
        <div className="mb-8 text-[13px]" style={{ color: "var(--text-muted)" }}>
          <span style={{ color: "var(--text-faint)" }}>Knows: </span>
          {q.data.connections.map((c, i) => (
            <span key={c.id}>
              {i > 0 && ", "}
              <Link
                to="/projects/$projectId/people/$personId"
                params={{ projectId, personId: c.id }}
                style={{ color: "var(--text)" }}
              >
                {c.fullName}
              </Link>
              {c.mentionOnly && <span style={{ color: "var(--text-faint)" }}> (mentioned)</span>}
            </span>
          ))}
        </div>
      )}

      {q.data.entries.length === 0 ? (
        <p className="text-[13px]" style={{ color: "var(--text-faint)" }}>No published entries yet.</p>
      ) : (
        <div className="space-y-8">
          {q.data.entries.map((e) => (
            <article key={e.id} className="border-b pb-8" style={{ borderColor: "var(--border)" }}>
              <h3 className="text-[18px] font-medium" style={{ color: "var(--text)" }}>{e.title}</h3>
              <div className="mt-1 text-[12px]" style={{ color: "var(--text-faint)" }}>
                {e.entryDate ? formatCallDate(e.entryDate) : relativeTime(e.publishedAt)}
                {e.authorName ? ` · ${e.authorName}` : ""}
              </div>
              <div className="mt-4"><MarkdownBody body={e.body} /></div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
