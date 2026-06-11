import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getPersonDetail } from "@/lib/people.functions";
import { MarkdownBody } from "@/components/portal/MarkdownBody";
import { relativeTime, formatCallDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/projects/$projectId/people/$personId")({
  component: PersonDetailPage,
});

function PersonDetailPage() {
  const { projectId, personId } = Route.useParams();
  const q = useQuery({
    queryKey: ["person", projectId, personId],
    queryFn: () => getPersonDetail({ data: { projectId, personId } }),
  });

  if (q.isLoading) return <p className="text-[13px]" style={{ color: "var(--text-faint)" }}>Loading…</p>;
  if (q.error || !q.data) return <p className="text-[13px]" style={{ color: "var(--text-faint)" }}>Not found.</p>;

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
      <h2 className="mt-3 mb-6 text-[22px] font-medium" style={{ color: "var(--text)" }}>{q.data.fullName}</h2>

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
