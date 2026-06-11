import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { listProjectPeople } from "@/lib/people.functions";
import { relativeTime } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/projects/$projectId/people")({
  component: PeopleTab,
});

function PeopleTab() {
  const { projectId } = Route.useParams();
  const people = useQuery({
    queryKey: ["project-people", projectId],
    queryFn: () => listProjectPeople({ data: { projectId } }),
  });

  if (people.isLoading) return <p className="text-[13px]" style={{ color: "var(--text-faint)" }}>Loading…</p>;
  const list = people.data ?? [];

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
        <Link
          key={p.id}
          to="/projects/$projectId/people/$personId"
          params={{ projectId, personId: p.id }}
          className="block rounded-xl p-5"
          style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
        >
          <h3 className="text-[15px] font-medium" style={{ color: "var(--text)" }}>{p.fullName}</h3>
          <p className="mt-1 text-[12px]" style={{ color: "var(--text-faint)" }}>
            in {p.entryCount} {p.entryCount === 1 ? "entry" : "entries"}
            {p.lastSeen ? ` · last ${relativeTime(p.lastSeen)}` : ""}
          </p>
        </Link>
      ))}
    </div>
  );
}
