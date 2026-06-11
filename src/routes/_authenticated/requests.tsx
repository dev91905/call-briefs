import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listOpenRequests, resolveRequest } from "@/lib/requests.functions";
import { ClientChip } from "@/components/portal/ClientChip";
import { relativeTime } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/requests")({
  component: RequestsPage,
});

function RequestsPage() {
  const qc = useQueryClient();
  const { data: requests, isLoading } = useQuery({
    queryKey: ["requests"],
    queryFn: () => listOpenRequests(),
  });
  const resolve = useMutation({
    mutationFn: useServerFn(resolveRequest),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["requests"] });
      qc.invalidateQueries({ queryKey: ["open-request-count"] });
    },
  });

  if (isLoading) return <div className="p-12 text-center" style={{ color: "var(--text-faint)" }}>Loading…</div>;

  const open = (requests ?? []).filter((r) => r.status === "open");
  const resolved = (requests ?? []).filter((r) => r.status === "resolved");

  return (
    <main className="mx-auto max-w-[880px] px-6 py-10">
      <h1 className="mb-6 text-[13px] font-medium" style={{ color: "var(--text-muted)" }}>Requests</h1>

      {open.length === 0 ? (
        <p className="text-[14px]" style={{ color: "var(--text-muted)" }}>No open requests.</p>
      ) : (
        <div className="space-y-3">
          {open.map((r) => (
            <article
              key={r.id}
              className="rounded-xl"
              style={{ background: "var(--surface)", border: "1px solid var(--border)", padding: 20 }}
            >
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ClientChip name={r.clientName} id={r.clientId} />
                  <span className="text-[12px]" style={{ color: "var(--text-faint)" }}>
                    {r.requesterName || r.requesterEmail}
                  </span>
                </div>
                <span className="text-[12px] tabular" style={{ color: "var(--text-faint)" }}>
                  {relativeTime(r.createdAt)}
                </span>
              </div>
              {r.briefTitle && (
                <div className="mb-2 text-[12px]" style={{ color: "var(--text-muted)" }}>
                  Re: {r.briefTitle}
                </div>
              )}
              <p className="text-[14px]" style={{ color: "var(--text)", lineHeight: 1.6 }}>{r.message}</p>
              <div className="mt-4 flex justify-end">
                <button
                  onClick={() => resolve.mutate({ data: { id: r.id } })}
                  className="text-[12px]"
                  style={{ color: "var(--text-muted)" }}
                >
                  Mark resolved
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {resolved.length > 0 && (
        <details className="mt-10">
          <summary className="cursor-pointer text-[12px]" style={{ color: "var(--text-faint)" }}>
            Resolved ({resolved.length})
          </summary>
          <div className="mt-3 space-y-2">
            {resolved.map((r) => (
              <div key={r.id} className="text-[12px]" style={{ color: "var(--text-faint)" }}>
                <span>{r.clientName}</span> · <span>{r.message.slice(0, 80)}{r.message.length > 80 ? "…" : ""}</span>
              </div>
            ))}
          </div>
        </details>
      )}
    </main>
  );
}
