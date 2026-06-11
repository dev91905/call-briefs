import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { previewClientFeed } from "@/lib/briefs.functions";
import { MarkdownBody } from "@/components/portal/MarkdownBody";
import { relativeTime, formatCallDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/preview/$clientId")({
  component: PreviewClient,
});

function PreviewClient() {
  const { clientId } = Route.useParams();
  const { data, isLoading, error } = useQuery({
    queryKey: ["preview-client-feed", clientId],
    queryFn: () => previewClientFeed({ data: { clientId } }),
  });

  return (
    <div>
      <div
        className="sticky top-[60px] z-10 border-b px-6 py-2 text-[12px]"
        style={{ background: "var(--surface-raised)", borderColor: "var(--border)", color: "var(--text-faint)" }}
      >
        <div className="mx-auto flex max-w-[760px] items-center justify-between">
          <span>
            Previewing as client{data?.clientName ? ` — ${data.clientName}` : ""}. Clients see exactly this.
          </span>
          <Link to="/clients" className="underline" style={{ color: "var(--text-muted)" }}>
            Exit preview
          </Link>
        </div>
      </div>

      <main className="mx-auto max-w-[760px] px-6 py-10">
        {isLoading ? (
          <p className="text-[13px]" style={{ color: "var(--text-faint)" }}>Loading…</p>
        ) : error ? (
          <p className="text-[13px]" style={{ color: "var(--destructive)" }}>{(error as Error).message}</p>
        ) : (
          <>
            <h1 className="mb-8 text-[13px] font-medium" style={{ color: "var(--text-muted)" }}>
              {data?.clientName ? `${data.clientName} — Briefs` : "Briefs"}
            </h1>

            {(data?.briefs ?? []).length === 0 ? (
              <div className="rounded-xl p-10 text-center" style={{ background: "var(--surface)" }}>
                <p className="text-[14px]" style={{ color: "var(--text-muted)" }}>
                  No published briefs for this client yet.
                </p>
              </div>
            ) : (
              <div className="space-y-8">
                {(data?.briefs ?? []).map((b) => (
                  <article key={b.id} className="border-b pb-8" style={{ borderColor: "var(--border)" }}>
                    <h2 className="mb-1 text-[20px] font-medium" style={{ color: "var(--text)" }}>{b.callTitle}</h2>
                    <div className="mb-4 text-[12px]" style={{ color: "var(--text-faint)" }}>
                      {b.callDate ? formatCallDate(b.callDate) : relativeTime(b.publishedAt)}
                      {b.participants ? ` · ${b.participants}` : ""}
                    </div>
                    <MarkdownBody body={b.body} />
                  </article>
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
