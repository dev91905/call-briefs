import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getSessionInfo } from "@/lib/session.functions";
import {
  getDrafts,
  createDraftBrief,
  updateBriefDraft,
  publishBrief,
  deleteDraftBrief,
  getClientFeed,
  markBriefRead,
} from "@/lib/briefs.functions";
import { listClientsForSelect } from "@/lib/admin.functions";
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
  if (session.role === "analyst" || session.role === "admin") return <Compose />;
  return <ClientFeed />;
}

function Loading() {
  return <div className="p-12 text-center" style={{ color: "var(--text-faint)" }}>Loading…</div>;
}

/* -------------------- ANALYST COMPOSE -------------------- */

type Draft = {
  id: string;
  clientId: string;
  clientName: string;
  callTitle: string;
  callDate: string | null;
  participants: string;
  body: string;
  updatedAt: string;
};

function Compose() {
  const qc = useQueryClient();
  const drafts = useQuery({ queryKey: ["drafts"], queryFn: () => getDrafts() });
  const clients = useQuery({ queryKey: ["clients-select"], queryFn: () => listClientsForSelect() });

  const [activeId, setActiveId] = useState<string | null>(null);

  // Auto-select first draft when list loads
  useEffect(() => {
    if (!activeId && drafts.data && drafts.data.length > 0) {
      setActiveId(drafts.data[0].id);
    }
  }, [drafts.data, activeId]);

  const create = useMutation({
    mutationFn: useServerFn(createDraftBrief),
    onSuccess: (res: { id: string }) => {
      qc.invalidateQueries({ queryKey: ["drafts"] });
      setActiveId(res.id);
    },
  });

  const del = useMutation({
    mutationFn: useServerFn(deleteDraftBrief),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["drafts"] });
      setActiveId(null);
    },
  });

  const active = useMemo(
    () => drafts.data?.find((d) => d.id === activeId) ?? null,
    [drafts.data, activeId],
  );

  const handleNew = () => {
    const firstClient = clients.data?.[0]?.id;
    if (!firstClient) return;
    create.mutate({ data: { clientId: firstClient } });
  };

  if (drafts.isLoading || clients.isLoading) return <Loading />;

  const clientOptions = clients.data ?? [];
  const hasClients = clientOptions.length > 0;

  return (
    <main className="mx-auto flex h-[calc(100vh-60px)] max-w-[1280px] gap-6 px-6 py-8">
      {/* Left rail */}
      <aside className="w-[280px] shrink-0 overflow-y-auto">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-[13px] font-medium" style={{ color: "var(--text-muted)" }}>Drafts</h1>
          <button
            onClick={handleNew}
            disabled={!hasClients || create.isPending}
            className="rounded-md px-2 py-1 text-[12px] font-medium disabled:opacity-50"
            style={{ background: "var(--text)", color: "#000" }}
            title={hasClients ? "New brief" : "Create a client first"}
          >
            + New
          </button>
        </div>

        {!hasClients ? (
          <p className="text-[12px]" style={{ color: "var(--text-faint)" }}>
            No clients yet. Add one in Clients before composing a brief.
          </p>
        ) : (drafts.data ?? []).length === 0 ? (
          <p className="text-[12px]" style={{ color: "var(--text-faint)" }}>
            Nothing in progress. Hit + New to start one.
          </p>
        ) : (
          <ul className="space-y-1">
            {(drafts.data ?? []).map((d) => (
              <li key={d.id}>
                <button
                  onClick={() => setActiveId(d.id)}
                  className="w-full rounded-md px-3 py-2 text-left transition"
                  style={{
                    background: d.id === activeId ? "var(--surface-raised)" : "transparent",
                    border: "1px solid",
                    borderColor: d.id === activeId ? "var(--border)" : "transparent",
                  }}
                >
                  <div className="truncate text-[13px]" style={{ color: "var(--text)" }}>
                    {d.callTitle || "Untitled brief"}
                  </div>
                  <div className="mt-0.5 truncate text-[11px]" style={{ color: "var(--text-faint)" }}>
                    {d.clientName} · {relativeTime(d.updatedAt)}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>

      {/* Editor */}
      <section className="flex-1 overflow-y-auto">
        {active ? (
          <Editor
            key={active.id}
            draft={active}
            clients={clientOptions}
            onDelete={() => del.mutate({ data: { id: active.id } })}
            onPublished={() => {
              qc.invalidateQueries({ queryKey: ["drafts"] });
              setActiveId(null);
            }}
          />
        ) : (
          <div
            className="flex h-full items-center justify-center rounded-xl p-10 text-center text-[13px]"
            style={{ background: "var(--surface)", color: "var(--text-faint)" }}
          >
            {hasClients
              ? "Select a draft on the left, or hit + New to start one."
              : "Add a client first, then come back to compose a brief."}
          </div>
        )}
      </section>
    </main>
  );
}

function Editor({
  draft,
  clients,
  onDelete,
  onPublished,
}: {
  draft: Draft;
  clients: { id: string; name: string }[];
  onDelete: () => void;
  onPublished: () => void;
}) {
  const qc = useQueryClient();
  const [clientId, setClientId] = useState(draft.clientId);
  const [callTitle, setCallTitle] = useState(draft.callTitle);
  const [callDate, setCallDate] = useState<string>(draft.callDate ?? "");
  const [participants, setParticipants] = useState(draft.participants);
  const [body, setBody] = useState(draft.body);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const update = useMutation({
    mutationFn: useServerFn(updateBriefDraft),
    onSuccess: () => {
      setSavedAt(Date.now());
      qc.invalidateQueries({ queryKey: ["drafts"] });
    },
  });
  const publish = useMutation({
    mutationFn: useServerFn(publishBrief),
    onSuccess: () => onPublished(),
  });

  const saveField = (patch: Parameters<typeof updateBriefDraft>[0]["data"]) => {
    update.mutate({ data: { id: draft.id, ...patch } });
  };

  const handlePublish = () => {
    // Persist any pending edits, then publish.
    update.mutate(
      {
        data: {
          id: draft.id,
          clientId,
          callTitle: callTitle.trim() || "Untitled brief",
          callDate: callDate || null,
          participants,
          body,
        },
      },
      {
        onSuccess: () => publish.mutate({ data: { id: draft.id } }),
      },
    );
  };

  const canPublish = clientId && callTitle.trim().length > 0 && body.trim().length > 0;

  return (
    <div className="mx-auto max-w-[760px] space-y-6 pb-24">
      <header className="flex items-center justify-between">
        <select
          value={clientId}
          onChange={(e) => {
            setClientId(e.target.value);
            saveField({ clientId: e.target.value });
          }}
          className="rounded-md px-3 py-2 text-[13px]"
          style={{ background: "var(--surface-raised)", border: "1px solid var(--border)", color: "var(--text)" }}
        >
          {clients.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>

        <div className="flex items-center gap-3 text-[11px]" style={{ color: "var(--text-faint)" }}>
          {update.isPending ? "Saving…" : savedAt ? `Saved ${relativeTime(new Date(savedAt).toISOString())}` : "Draft"}
          <button
            onClick={onDelete}
            className="rounded-md px-2 py-1"
            style={{ color: "var(--text-faint)" }}
            title="Delete draft"
          >
            Delete
          </button>
        </div>
      </header>

      <input
        value={callTitle}
        onChange={(e) => setCallTitle(e.target.value)}
        onBlur={() => saveField({ callTitle: callTitle.trim() || "Untitled brief" })}
        placeholder="Call title"
        className="block w-full bg-transparent text-[28px] font-medium leading-tight outline-none"
        style={{ color: "var(--text)" }}
      />

      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-y py-3" style={{ borderColor: "var(--border)" }}>
        <label className="flex items-center gap-2 text-[12px]" style={{ color: "var(--text-faint)" }}>
          <span>Date</span>
          <input
            type="date"
            value={callDate}
            onChange={(e) => setCallDate(e.target.value)}
            onBlur={() => saveField({ callDate: callDate || null })}
            className="rounded-md bg-transparent px-2 py-1 text-[13px] outline-none"
            style={{ border: "1px solid var(--border)", color: "var(--text)" }}
          />
          {callDate && (
            <span className="text-[12px]" style={{ color: "var(--text-faint)" }}>
              {formatCallDate(callDate)}
            </span>
          )}
        </label>

        <label className="flex flex-1 items-center gap-2 text-[12px]" style={{ color: "var(--text-faint)" }}>
          <span>Participants</span>
          <input
            value={participants}
            onChange={(e) => setParticipants(e.target.value)}
            onBlur={() => saveField({ participants })}
            placeholder="Jane Doe, John Smith"
            className="flex-1 bg-transparent text-[13px] outline-none"
            style={{ color: "var(--text)" }}
          />
        </label>
      </div>

      <BodyEditor value={body} onChange={setBody} onCommit={() => saveField({ body })} />

      <div className="flex items-center justify-end gap-3 pt-4">
        <button
          onClick={() => saveField({ clientId, callTitle: callTitle.trim() || "Untitled brief", callDate: callDate || null, participants, body })}
          disabled={update.isPending}
          className="h-10 rounded-md px-4 text-[13px] disabled:opacity-50"
          style={{ background: "var(--surface-raised)", border: "1px solid var(--border)", color: "var(--text)" }}
        >
          Save draft
        </button>
        <button
          onClick={handlePublish}
          disabled={!canPublish || publish.isPending || update.isPending}
          className="h-10 rounded-md px-5 text-[13px] font-medium disabled:opacity-50"
          style={{ background: "var(--text)", color: "#000" }}
        >
          {publish.isPending ? "Publishing…" : "Publish to client"}
        </button>
      </div>
      {publish.error && (
        <p className="text-right text-[12px]" style={{ color: "var(--destructive)" }}>
          {(publish.error as Error).message}
        </p>
      )}
    </div>
  );
}

function BodyEditor({
  value,
  onChange,
  onCommit,
}: {
  value: string;
  onChange: (v: string) => void;
  onCommit: () => void;
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.max(el.scrollHeight, 320) + "px";
  }, [value]);

  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onCommit}
      placeholder="Write the brief. Markdown supported — # headings, **bold**, lists, links."
      className="block w-full resize-none bg-transparent text-[15px] leading-[1.6] outline-none"
      style={{ color: "var(--text)", minHeight: 320 }}
    />
  );
}

/* -------------------- CLIENT FEED -------------------- */

function ClientFeed() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["client-feed"], queryFn: () => getClientFeed() });
  const mark = useMutation({
    mutationFn: useServerFn(markBriefRead),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["client-feed"] }),
  });

  if (isLoading || !data) return <Loading />;

  return (
    <main className="mx-auto max-w-[760px] px-6 py-10">
      <h1 className="mb-8 text-[13px] font-medium" style={{ color: "var(--text-muted)" }}>
        {data.clientName ? `${data.clientName} — Briefs` : "Briefs"}
      </h1>

      {data.briefs.length === 0 ? (
        <div className="surface rounded-xl p-10 text-center" style={{ background: "var(--surface)" }}>
          <p className="text-[14px]" style={{ color: "var(--text-muted)" }}>
            No briefs yet. They'll appear here as soon as your analyst publishes one.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {data.briefs.map((b) => (
            <article
              key={b.id}
              onMouseEnter={() => !b.isRead && mark.mutate({ data: { briefId: b.id } })}
              className="border-b pb-8"
              style={{ borderColor: "var(--border)" }}
            >
              <h2 className="mb-1 text-[20px] font-medium" style={{ color: "var(--text)" }}>{b.callTitle}</h2>
              <div className="mb-4 text-[12px]" style={{ color: "var(--text-faint)" }}>
                {b.callDate ? formatCallDate(b.callDate) : relativeTime(b.publishedAt)}
                {b.participants ? ` · ${b.participants}` : ""}
              </div>
              <MarkdownBody source={b.body} />
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
