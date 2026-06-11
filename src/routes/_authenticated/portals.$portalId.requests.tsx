import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { listPortalRequests, createPortalRequest, setRequestStatus } from "@/lib/portal-requests.functions";

export const Route = createFileRoute("/_authenticated/portals/$portalId/requests")({
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData({
      queryKey: ["portal-requests", params.portalId],
      queryFn: () => listPortalRequests({ data: { portalId: params.portalId } }),
    }),
  component: RequestsPage,
});

const parentApi = getRouteApi("/_authenticated/portals/$portalId");

function RequestsPage() {
  const { portalId } = parentApi.useParams();
  const qc = useQueryClient();
  const { data: rows } = useSuspenseQuery({
    queryKey: ["portal-requests", portalId],
    queryFn: () => listPortalRequests({ data: { portalId } }),
  });
  const create = useServerFn(createPortalRequest);
  const setStatus = useServerFn(setRequestStatus);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  async function submit() {
    if (!subject.trim()) return;
    await create({ data: { portalId, subject, body: body || undefined } });
    setSubject(""); setBody("");
    qc.invalidateQueries({ queryKey: ["portal-requests", portalId] });
    qc.invalidateQueries({ queryKey: ["activity"] });
  }

  async function toggle(id: string, status: string) {
    await setStatus({ data: { portalId, id, status: status === "open" ? "closed" : "open" } });
    qc.invalidateQueries({ queryKey: ["portal-requests", portalId] });
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2 rounded-md p-4" style={{ border: "1px solid var(--border)" }}>
        <input
          placeholder="What do you need?"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className="w-full bg-transparent text-[15px] outline-none"
          style={{ color: "var(--text)" }}
        />
        <textarea
          placeholder="Details (optional)"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={2}
          className="w-full rounded px-2 py-1.5 text-[13px]"
          style={{ background: "var(--surface-raised)", border: "1px solid var(--border)", color: "var(--text)" }}
        />
        <div className="flex justify-end">
          <button
            onClick={submit}
            disabled={!subject.trim()}
            className="h-8 rounded px-3 text-[12px] font-medium"
            style={{ background: "var(--text)", color: "#000", opacity: subject.trim() ? 1 : 0.4 }}
          >
            Add request
          </button>
        </div>
      </div>

      <ul className="space-y-2">
        {rows.map((r: any) => (
          <li key={r.id} className="rounded-md p-3" style={{ border: "1px solid var(--border)", opacity: r.status === "closed" ? 0.5 : 1 }}>
            <div className="flex items-center justify-between">
              <div className="text-[14px]" style={{ color: "var(--text)" }}>{r.subject}</div>
              <button onClick={() => toggle(r.id, r.status)} className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                {r.status === "open" ? "Close" : "Reopen"}
              </button>
            </div>
            {r.body && <p className="mt-1 text-[12px]" style={{ color: "var(--text-muted)" }}>{r.body}</p>}
          </li>
        ))}
        {rows.length === 0 && <li className="text-[12px]" style={{ color: "var(--text-faint)" }}>No requests yet.</li>}
      </ul>
    </div>
  );
}
