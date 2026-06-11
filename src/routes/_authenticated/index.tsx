import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { listMyProjects, type ProjectSummary } from "@/lib/projects.functions";
import { listLatestAcrossMyProjects, type EntryListItem } from "@/lib/entries.functions";
import { MarkdownBody } from "@/components/portal/MarkdownBody";
import { relativeTime, formatCallDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/")({
  component: HomePage,
});

function HomePage() {
  const projects = useQuery({ queryKey: ["my-projects"], queryFn: () => listMyProjects() });
  const latest = useQuery({ queryKey: ["latest-entries"], queryFn: () => listLatestAcrossMyProjects() });

  const [filter, setFilter] = useState<string>("__all");

  if (projects.isLoading) {
    return <div className="p-12 text-center" style={{ color: "var(--text-faint)" }}>Loading…</div>;
  }

  const list = projects.data ?? [];
  const entries = (latest.data ?? []) as EntryListItem[];
  const visible = filter === "__all" ? entries : entries.filter((e) => e.projectId === filter);

  return (
    <main className="mx-auto max-w-[960px] px-6 py-10">
      <section className="mb-12">
        <div className="mb-5 flex items-end justify-between">
          <h1 className="text-[13px] font-medium" style={{ color: "var(--text-muted)" }}>Your projects</h1>
          <Link
            to="/projects/new"
            className="h-9 rounded-md px-4 text-[13px] font-medium inline-flex items-center"
            style={{ background: "var(--text)", color: "#000" }}
          >
            + New project
          </Link>
        </div>

        {list.length === 0 ? (
          <div className="rounded-xl p-10 text-center" style={{ background: "var(--surface)" }}>
            <p className="text-[14px]" style={{ color: "var(--text-muted)" }}>
              You're not in any project yet. Start one to begin capturing intelligence.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {list.map((p) => <ProjectCard key={p.id} p={p} />)}
          </div>
        )}
      </section>

      {list.length > 0 && (
        <section>
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-[13px] font-medium" style={{ color: "var(--text-muted)" }}>Latest intelligence</h2>
            <div className="flex flex-wrap gap-2">
              <FilterPill active={filter === "__all"} onClick={() => setFilter("__all")} label="All" />
              {list.map((p) => (
                <FilterPill
                  key={p.id}
                  active={filter === p.id}
                  onClick={() => setFilter(p.id)}
                  label={p.name}
                />
              ))}
            </div>
          </div>

          {latest.isLoading ? (
            <p className="text-[13px]" style={{ color: "var(--text-faint)" }}>Loading entries…</p>
          ) : visible.length === 0 ? (
            <div className="rounded-xl p-8 text-center" style={{ background: "var(--surface)" }}>
              <p className="text-[13px]" style={{ color: "var(--text-faint)" }}>Nothing published here yet.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {visible.map((e) => <EntryFeedCard key={e.id} e={e} />)}
            </div>
          )}
        </section>
      )}
    </main>
  );
}

function FilterPill({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className="h-7 rounded-full px-3 text-[12px]"
      style={{
        background: active ? "var(--text)" : "transparent",
        color: active ? "#000" : "var(--text-muted)",
        border: active ? "1px solid var(--text)" : "1px solid var(--border)",
      }}
    >
      {label}
    </button>
  );
}

function ProjectCard({ p }: { p: ProjectSummary }) {
  return (
    <Link
      to="/projects/$projectId"
      params={{ projectId: p.id }}
      className="block rounded-xl p-5 transition hover:translate-y-[-1px]"
      style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
    >
      <div className="flex items-start justify-between">
        <h3 className="text-[16px] font-medium" style={{ color: "var(--text)" }}>{p.name}</h3>
        <RoleChip role={p.role} />
      </div>
      <div className="mt-3 text-[12px]" style={{ color: "var(--text-faint)" }}>
        {p.memberCount} {p.memberCount === 1 ? "member" : "members"} · {p.entryCount}{" "}
        {p.entryCount === 1 ? "entry" : "entries"}
      </div>
    </Link>
  );
}

export function RoleChip({ role }: { role: "owner" | "co_owner" | "member" }) {
  const label = role === "owner" ? "Owner" : role === "co_owner" ? "Co-owner" : "Member";
  return (
    <span
      className="rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider"
      style={{ background: "var(--surface-raised)", color: "var(--text-muted)" }}
    >
      {label}
    </span>
  );
}

function EntryFeedCard({ e }: { e: EntryListItem }) {
  const preview = e.body.split(/\n\s*\n/)[0]?.slice(0, 200) ?? "";
  return (
    <Link
      to="/projects/$projectId"
      params={{ projectId: e.projectId }}
      className="block rounded-xl p-5"
      style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
    >
      <h3 className="text-[16px] font-medium" style={{ color: "var(--text)" }}>{e.title}</h3>
      <div className="mt-1 text-[11px]" style={{ color: "var(--text-faint)" }}>
        {e.projectName} · {e.entryDate ? formatCallDate(e.entryDate) : relativeTime(e.publishedAt)}
        {e.authorName ? ` · ${e.authorName}` : ""}
      </div>
      {preview && (
        <p className="mt-3 line-clamp-2 text-[13px]" style={{ color: "var(--text-muted)" }}>
          {preview}
        </p>
      )}
    </Link>
  );
}

// Re-export so other files can reuse the markdown body via this entry point
export { MarkdownBody };
