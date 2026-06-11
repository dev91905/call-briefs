import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getProject } from "@/lib/projects.functions";
import { RoleChip } from "@/routes/_authenticated/index";

export const Route = createFileRoute("/_authenticated/projects/$projectId")({
  component: ProjectLayout,
});

function ProjectLayout() {
  const { projectId } = Route.useParams();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const project = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => getProject({ data: { id: projectId } }),
  });

  if (project.isLoading) {
    return <div className="p-12 text-center" style={{ color: "var(--text-faint)" }}>Loading…</div>;
  }
  if (project.error || !project.data) {
    return (
      <div className="p-12 text-center" style={{ color: "var(--text-faint)" }}>
        Project not found, or you don't have access.
      </div>
    );
  }

  const myRole = project.data.myRole ?? "member";
  const base = `/projects/${projectId}`;
  const tab = (to: string, label: string) => {
    const active = to === base ? path === base : path.startsWith(to);
    return (
      <Link
        to={to}
        className="relative pb-3 text-[13px] font-medium"
        style={{
          color: active ? "var(--text)" : "var(--text-faint)",
          borderBottom: active ? "1px solid #fff" : "1px solid transparent",
          marginBottom: -1,
        }}
      >
        {label}
      </Link>
    );
  };

  return (
    <div className="mx-auto max-w-[960px] px-6 pt-8">
      <Link to="/" className="text-[12px]" style={{ color: "var(--text-faint)" }}>
        ← All projects
      </Link>
      <div className="mt-3 flex items-center gap-3">
        <h1 className="text-[26px] font-medium" style={{ color: "var(--text)" }}>
          {project.data.name}
        </h1>
        <RoleChip role={myRole} />
      </div>

      <nav className="mt-6 flex gap-6 border-b" style={{ borderColor: "var(--border)" }}>
        {tab(base, "Intelligence")}
        {tab(`${base}/people`, "People")}
        {tab(`${base}/settings`, "Settings")}
      </nav>

      <div className="py-6">
        <Outlet />
      </div>
    </div>
  );
}
