import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getPublishedBriefs } from "@/lib/briefs.functions";
import { ClientChip } from "@/components/portal/ClientChip";
import { formatCallDate, relativeTime } from "@/lib/format";
import { useState } from "react";

export const Route = createFileRoute("/_authenticated/published")({
  component: PublishedPage,
});

function PublishedPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["published-briefs"],
    queryFn: () => getPublishedBriefs(),
  });
  const [filter, setFilter] = useState<string | null>(null);

  if (isLoading) return <div className="p-12 text-center" style={{ color: "var(--text-faint)" }}>Loading…</div>;
  const all = data ?? [];
  const clients = Array.from(new Map(all.map((b) => [b.clientId, b.clientName])).entries());
  const rows = filter ? all.filter((b) => b.clientId === filter) : all;

  return (
    <main className="mx-auto max-w-[880px] px-6 py-10">
      <h1 className="mb-6 text-[13px] font-medium" style={{ color: "var(--text-muted)" }}>Published</h1>

      {clients.length > 0 && (
        <div className="mb-6 flex flex-wrap gap-2">
          <FilterPill active={filter === null} onClick={() => setFilter(null)}>All</FilterPill>
          {clients.map(([id, name]) => (
            <FilterPill key={id} active={filter === id} onClick={() => setFilter(id)}>{name}</FilterPill>
          ))}
        </div>
      )}

      {rows.length === 0 ? (
        <p className="text-[14px]" style={{ color: "var(--text-muted)" }}>Nothing published yet.</p>
      ) : (
        <div className="rounded-xl" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
          {rows.map((b, i) => (
            <div
              key={b.id}
              className="flex items-center justify-between px-5 py-3"
              style={{ borderTop: i === 0 ? "none" : "1px solid var(--border)" }}
            >
              <div className="flex items-center gap-3 min-w-0">
                <ClientChip name={b.clientName} id={b.clientId} />
                <span className="truncate text-[14px]" style={{ color: "var(--text)" }}>{b.callTitle}</span>
              </div>
              <div className="flex items-center gap-4 text-[12px] tabular" style={{ color: "var(--text-faint)" }}>
                {b.hasReads && <span title="Read by client">👁</span>}
                <span>{formatCallDate(b.callDate) || relativeTime(b.publishedAt)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}

function FilterPill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="rounded-full px-3 py-1 text-[12px]"
      style={{
        background: active ? "var(--surface-raised)" : "transparent",
        border: "1px solid var(--border)",
        color: active ? "var(--text)" : "var(--text-muted)",
      }}
    >
      {children}
    </button>
  );
}
