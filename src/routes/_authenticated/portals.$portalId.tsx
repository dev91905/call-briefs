import { createFileRoute, Outlet, Link, useRouterState } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { getPortal } from "@/lib/portals.functions";

export const Route = createFileRoute("/_authenticated/portals/$portalId")({
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData({
      queryKey: ["portal", params.portalId],
      queryFn: () => getPortal({ data: { portalId: params.portalId } }),
    }),
  component: PortalLayout,
  errorComponent: ({ error }) => (
    <main className="mx-auto max-w-[860px] px-6 py-10">
      <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>{error.message}</p>
      <Link to="/" className="mt-4 inline-block text-[13px]" style={{ color: "var(--text)" }}>← Home</Link>
    </main>
  ),
});

function PortalLayout() {
  const { portalId } = Route.useParams();
  const { data: portal } = useSuspenseQuery({
    queryKey: ["portal", portalId],
    queryFn: () => getPortal({ data: { portalId } }),
  });
  const path = useRouterState({ select: (s) => s.location.pathname });

  const tabs = [
    { to: "/portals/$portalId", label: "Feed", exact: true },
    { to: "/portals/$portalId/people", label: "People" },
    { to: "/portals/$portalId/map", label: "Map" },
    { to: "/portals/$portalId/requests", label: "Requests" },
    { to: "/portals/$portalId/settings", label: "Settings" },
  ];

  return (
    <div className="mx-auto max-w-[1280px] px-6 pt-8">
      <div className="flex items-center gap-3">
        <Link to="/" className="text-[12px]" style={{ color: "var(--text-faint)" }}>← Home</Link>
        <h1 className="text-[20px] font-medium" style={{ color: "var(--text)" }}>{portal.name}</h1>
        <span className="text-[11px] uppercase tracking-wider" style={{ color: "var(--text-faint)" }}>
          {portal.myRole.replace("_", " ")}
        </span>
      </div>

      <nav className="mt-6 flex gap-6 border-b" style={{ borderColor: "var(--border)" }}>
        {tabs.map((t) => {
          const fullPath = t.to.replace("$portalId", portalId);
          const active = t.exact ? path === fullPath : path.startsWith(fullPath);
          return (
            <Link
              key={t.to}
              to={t.to}
              params={{ portalId }}
              className="pb-2 text-[13px]"
              style={{
                color: active ? "var(--text)" : "var(--text-faint)",
                borderBottom: active ? "1px solid #fff" : "1px solid transparent",
                marginBottom: -1,
              }}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>

      <div className="py-6">
        <Outlet />
      </div>
    </div>
  );
}
