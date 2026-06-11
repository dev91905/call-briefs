import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, useQuery } from "@tanstack/react-query";
import { listMyPortals } from "@/lib/portals.functions";
import { listActivity } from "@/lib/entries.functions";

export const Route = createFileRoute("/_authenticated/")({
  loader: ({ context }) =>
    context.queryClient.ensureQueryData({ queryKey: ["my-portals"], queryFn: () => listMyPortals() }),
  component: HomePage,
  errorComponent: ({ error }) => (
    <main className="mx-auto max-w-[860px] px-6 py-10">
      <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>{error.message}</p>
    </main>
  ),
});

function relTime(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function HomePage() {
  const { data: portals } = useSuspenseQuery({ queryKey: ["my-portals"], queryFn: () => listMyPortals() });
  const { data: activity, isLoading } = useQuery({ queryKey: ["activity"], queryFn: () => listActivity() });

  return (
    <main className="mx-auto grid max-w-[1280px] gap-8 px-6 py-10 md:grid-cols-[240px_1fr]">
      <aside className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-[11px] uppercase tracking-wider" style={{ color: "var(--text-faint)" }}>Portals</h2>
          <Link
            to="/portals/new"
            className="text-[11px] uppercase tracking-wider"
            style={{ color: "var(--text-muted)" }}
          >
            + New
          </Link>
        </div>
        <nav className="space-y-1">
          {portals.length === 0 && (
            <p className="text-[12px]" style={{ color: "var(--text-faint)" }}>
              You're not in any portals yet.
            </p>
          )}
          {portals.map((p) => (
            <Link
              key={p.id}
              to="/portals/$portalId"
              params={{ portalId: p.id }}
              className="block rounded px-2 py-1.5 text-[13px]"
              style={{ color: "var(--text)" }}
            >
              <div>{p.name}</div>
              <div className="text-[11px]" style={{ color: "var(--text-faint)" }}>{p.role.replace("_", " ")}</div>
            </Link>
          ))}
        </nav>
      </aside>

      <section className="space-y-3">
        <h1 className="text-[13px] font-medium" style={{ color: "var(--text-muted)" }}>Activity</h1>
        {isLoading && <p className="text-[12px]" style={{ color: "var(--text-faint)" }}>Loading…</p>}
        {(activity ?? []).length === 0 && !isLoading && (
          <p className="text-[12px]" style={{ color: "var(--text-faint)" }}>
            Nothing yet. Open a portal and add intelligence.
          </p>
        )}
        <ul className="space-y-2">
          {(activity ?? []).map((a) => (
            <li key={`${a.type}-${a.id}`} style={{ border: "1px solid var(--border)", borderRadius: 6 }}>
              <Link
                to="/portals/$portalId"
                params={{ portalId: a.portalId }}
                className="block px-4 py-3"
              >
                <div className="flex items-center gap-2">
                  <span
                    className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded"
                    style={{
                      background: a.type === "intel" ? "var(--surface-raised)" : "transparent",
                      border: "1px solid var(--border)",
                      color: "var(--text-muted)",
                    }}
                  >
                    {a.type}
                  </span>
                  <span className="text-[12px]" style={{ color: "var(--text-faint)" }}>{a.portalName}</span>
                  <span className="ml-auto text-[11px]" style={{ color: "var(--text-faint)" }}>{relTime(a.createdAt)}</span>
                </div>
                <div className="mt-1.5 text-[14px]" style={{ color: "var(--text)" }}>{a.title}</div>
                {a.preview && (
                  <div className="mt-0.5 line-clamp-2 text-[12px]" style={{ color: "var(--text-muted)" }}>
                    {a.preview}
                  </div>
                )}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
