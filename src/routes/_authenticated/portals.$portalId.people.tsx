import { createFileRoute, Link, getRouteApi } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { listPeople } from "@/lib/people.functions";

export const Route = createFileRoute("/_authenticated/portals/$portalId/people")({
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData({
      queryKey: ["people", params.portalId],
      queryFn: () => listPeople({ data: { portalId: params.portalId } }),
    }),
  component: PeoplePage,
});

const parentApi = getRouteApi("/_authenticated/portals/$portalId");

function PeoplePage() {
  const { portalId } = parentApi.useParams();
  const { data: people } = useSuspenseQuery({
    queryKey: ["people", portalId],
    queryFn: () => listPeople({ data: { portalId } }),
  });

  if (people.length === 0) {
    return <p className="text-[12px]" style={{ color: "var(--text-faint)" }}>No people yet. Add intelligence entries to populate the directory.</p>;
  }

  return (
    <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {people.map((p: any) => (
        <li key={p.id}>
          <Link
            to="/portals/$portalId/people/$personId"
            params={{ portalId, personId: p.id }}
            className="block rounded-md p-3"
            style={{ border: "1px solid var(--border)" }}
          >
            <div className="text-[14px] font-medium" style={{ color: "var(--text)" }}>{p.name}</div>
            {p.org && <div className="text-[12px]" style={{ color: "var(--text-muted)" }}>{p.org}</div>}
            <div className="mt-1 text-[11px]" style={{ color: "var(--text-faint)" }}>
              {p.mentionCount} mention{p.mentionCount === 1 ? "" : "s"}
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
