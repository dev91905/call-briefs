import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getSessionInfo } from "@/lib/session.functions";
import {
  getPendingBriefs,
  updateBriefDraft,
  publishBrief,
  rejectBrief,
  getClientFeed,
  markBriefRead,
} from "@/lib/briefs.functions";
import { createRequest } from "@/lib/requests.functions";
import { ClientChip } from "@/components/portal/ClientChip";
import { MarkdownBody } from "@/components/portal/MarkdownBody";
import { relativeTime, formatCallDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/queue")({
  component: HomeDispatcher,
});

function HomeDispatcher() {
  const { data: session, isLoading } = useQuery({
    queryKey: ["session"],
    queryFn: () => getSessionInfo(),
  });
  if (isLoading || !session) return <Loading />;
  if (session.role === "analyst" || session.role === "admin") return <ReviewQueue />;
  return <ClientFeed />;
}

function Loading() {
  return <div className="p-12 text-center" style={{ color: "var(--text-faint)" }}>Loading…</div>;
}

/* -------------------- ANALYST REVIEW QUEUE -------------------- */

function ReviewQueue() {
  const qc = useQueryClient();
  const { data: briefs, isLoading } = useQuery({
    queryKey: ["pending-briefs"],
    queryFn: () => getPendingBriefs(),
  });

  const publish = useMutation({
    mutationFn: useServerFn(publishBrief),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pending-briefs"] }),
  });
  const reject = useMutation({
    mutationFn: useServerFn(rejectBrief),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pending-briefs"] }),
  });

  if (isLoading) return <Loading />;

  return (
    <main className="mx-auto max-w-[880px] px-6 py-10">
      <h1 className="mb-8 text-[13px] font-medium" style={{ color: "var(--text-muted)" }}>Review queue</h1>

      {(!briefs || briefs.length === 0) ? (
        <div className="surface rounded-xl p-10 text-center" style={{ background: "var(--surface)" }}>
          <p className="text-[14px]" style={{ color: "var(--text-muted)" }}>
            Queue clear. New calls appear here within 15 minutes of filing them in Granola.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {briefs.map((b) => (
            <PendingCard
              key={b.id}
              brief={b}
              onPublish={() => publish.mutate({ data: { id: b.id } })}
              onReject={() => reject.mutate({ data: { id: b.id } })}
              publishing={publish.isPending}
            />
          ))}
        </div>
      )}
    </main>
  );
}

function PendingCard({
  brief,
  onPublish,
  onReject,
  publishing,
}: {
  brief: {
    id: string;
    clientName: string;
    clientId: string;
    callTitle: string;
    callDate: string | null;
    participants: string;
    body: string;
    createdAt: string;
  };
  onPublish: () => void;
  onReject: () => void;
  publishing: boolean;
}) {
  const update = useServerFn(updateBriefDraft);
  const [body, setBody] = useState(brief.body);
  const [title, setTitle] = useState(brief.callTitle);
  const [participants, setParticipants] = useState(brief.participants);
  const [savingState, setSavingState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const taRef = useRef<HTMLTextAreaElement | null>(null);

  // Autoresize textarea
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = ta.scrollHeight + "px";
  }, [body]);

  const persist = async (patch: { body?: string; callTitle?: string; participants?: string }) => {
    setSavingState("saving");
    try {
      await update({ data: { id: brief.id, ...patch } });
      setSavingState("saved");
    } catch {
      setSavingState("error");
    }
  };

  const queueSave = (patch: { body?: string; callTitle?: string; participants?: string }) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => persist(patch), 800);
  };

  return (
    <article
      className="rounded-xl"
      style={{ background: "var(--surface)", border: "1px solid var(--border)", padding: 24 }}
    >
      <div className="mb-4 flex items-center justify-between">
        <ClientChip name={brief.clientName} id={brief.clientId} />
        <span className="text-[12px] tabular" style={{ color: "var(--text-faint)" }}>
          {relativeTime(brief.createdAt)}
        </span>
      </div>

      <input
        value={title}
        onChange={(e) => { setTitle(e.target.value); queueSave({ callTitle: e.target.value }); }}
        onBlur={() => persist({ callTitle: title })}
        className="mb-1 block w-full bg-transparent text-[16px] font-semibold outline-none"
        style={{ color: "var(--text)" }}
      />
      <div className="mb-4 flex items-center gap-2 text-[13px]" style={{ color: "var(--text-muted)" }}>
        <span className="tabular">{formatCallDate(brief.callDate)}</span>
        <span>·</span>
        <input
          value={participants}
          onChange={(e) => { setParticipants(e.target.value); queueSave({ participants: e.target.value }); }}
          onBlur={() => persist({ participants })}
          placeholder="participants"
          className="flex-1 bg-transparent outline-none"
          style={{ color: "var(--text-muted)" }}
        />
      </div>

      <textarea
        ref={taRef}
        value={body}
        onChange={(e) => { setBody(e.target.value); queueSave({ body: e.target.value }); }}
        onBlur={() => persist({ body })}
        placeholder="bold for lead sentences"
        className="block w-full resize-none bg-transparent outline-none"
        style={{
          color: "var(--text)",
          fontSize: 15.5,
          lineHeight: 1.75,
          minHeight: 200,
          overflow: "hidden",
          wordBreak: "break-word",
          overflowWrap: "break-word",
        }}
      />

      <div className="mt-6 flex items-center justify-between">
        <span className="text-[12px]" style={{ color: savingState === "error" ? "var(--destructive)" : "var(--text-faint)" }}>
          {savingState === "saving" && "Saving…"}
          {savingState === "saved" && "Saved"}
          {savingState === "error" && "Couldn't save — retry"}
        </span>
        <div className="flex items-center gap-3">
          <button
            onClick={onReject}
            className="text-[13px]"
            style={{ color: "var(--text-muted)" }}
          >
            Reject
          </button>
          <button
            onClick={onPublish}
            disabled={publishing || savingState === "saving"}
            className="h-9 rounded-md px-4 text-[13px] font-medium disabled:opacity-50"
            style={{ background: "var(--text)", color: "#000" }}
          >
            Publish
          </button>
        </div>
      </div>
    </article>
  );
}

/* -------------------- CLIENT FEED -------------------- */

function ClientFeed() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["client-feed"],
    queryFn: () => getClientFeed(),
  });
  const mark = useServerFn(markBriefRead);
  const create = useMutation({
    mutationFn: useServerFn(createRequest),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["open-request-count"] }),
  });
  const [askOpen, setAskOpen] = useState(false);

  if (isLoading) return <Loading />;
  const briefs = data?.briefs ?? [];

  return (
    <main className="mx-auto max-w-[680px] px-6 py-10">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-[13px] font-medium" style={{ color: "var(--text-muted)" }}>
          {data?.clientName ?? "Briefs"}
        </h1>
        <button
          onClick={() => setAskOpen(true)}
          className="text-[12px]"
          style={{ color: "var(--text-faint)" }}
        >
          Ask us anything
        </button>
      </div>

      {askOpen && (
        <RequestBox
          onSend={async (msg) => {
            await create.mutateAsync({ data: { briefId: null, message: msg } });
            setAskOpen(false);
          }}
          onCancel={() => setAskOpen(false)}
        />
      )}

      {briefs.length === 0 ? (
        <div className="surface rounded-xl p-10 text-center" style={{ background: "var(--surface)" }}>
          <p className="text-[14px]" style={{ color: "var(--text-muted)" }}>
            No briefs yet. They appear here after each call.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {briefs.map((b) => (
            <ClientBriefCard
              key={b.id}
              brief={b}
              onView={() => mark({ data: { briefId: b.id } })}
              onRequest={(msg) => create.mutateAsync({ data: { briefId: b.id, message: msg } })}
            />
          ))}
        </div>
      )}
    </main>
  );
}

function ClientBriefCard({
  brief,
  onView,
  onRequest,
}: {
  brief: {
    id: string;
    callTitle: string;
    callDate: string | null;
    participants: string;
    body: string;
    publishedAt: string | null;
    isRead: boolean;
  };
  onView: () => void;
  onRequest: (msg: string) => Promise<unknown>;
}) {
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState(brief.isRead);
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (seen) return;
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          onView();
          setSeen(true);
          obs.disconnect();
        }
      },
      { threshold: 0.5 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [seen, onView]);

  return (
    <article
      ref={ref as any}
      className="rounded-xl"
      style={{ background: "var(--surface)", border: "1px solid var(--border)", padding: 24 }}
    >
      <div className="mb-2 flex items-start justify-between gap-3">
        <h2 className="text-[16px] font-semibold" style={{ color: "var(--text)" }}>
          {!seen && <span className="dot dot-published mr-2 align-middle" />}
          {brief.callTitle}
        </h2>
        <span className="text-[12px] tabular shrink-0" style={{ color: "var(--text-faint)" }}>
          {relativeTime(brief.publishedAt)}
        </span>
      </div>
      <div className="mb-4 text-[13px]" style={{ color: "var(--text-muted)" }}>
        <span className="tabular">{formatCallDate(brief.callDate)}</span>
        {brief.participants && <> · {brief.participants}</>}
      </div>

      <MarkdownBody body={brief.body} />

      <div className="mt-6 flex justify-end">
        {open ? (
          <div className="w-full">
            <RequestBox
              onSend={async (msg) => { await onRequest(msg); setOpen(false); }}
              onCancel={() => setOpen(false)}
            />
          </div>
        ) : (
          <button onClick={() => setOpen(true)} className="text-[13px]" style={{ color: "var(--text-muted)" }}>
            Request more detail
          </button>
        )}
      </div>
    </article>
  );
}

function RequestBox({
  onSend,
  onCancel,
}: {
  onSend: (msg: string) => Promise<unknown>;
  onCancel: () => void;
}) {
  const [msg, setMsg] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  if (sent) {
    return (
      <p className="my-2 text-[13px]" style={{ color: "var(--text-faint)" }}>
        Sent. We'll come back to you.
      </p>
    );
  }
  return (
    <div className="surface-raised mt-4 rounded-md p-3" style={{ background: "var(--surface-raised)" }}>
      <textarea
        autoFocus
        value={msg}
        onChange={(e) => setMsg(e.target.value)}
        placeholder="What do you want to know?"
        className="block w-full resize-none bg-transparent text-[14px] outline-none"
        style={{ color: "var(--text)", minHeight: 80 }}
      />
      <div className="mt-2 flex justify-end gap-2">
        <button onClick={onCancel} className="text-[12px]" style={{ color: "var(--text-faint)" }}>Cancel</button>
        <button
          disabled={!msg.trim() || busy}
          onClick={async () => {
            setBusy(true);
            try { await onSend(msg.trim()); setSent(true); } finally { setBusy(false); }
          }}
          className="h-8 rounded-md px-3 text-[12px] font-medium disabled:opacity-50"
          style={{ background: "var(--text)", color: "#000" }}
        >
          Send
        </button>
      </div>
    </div>
  );
}
