import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  listProjectEntries,
  createDraft,
  updateDraft,
  publishEntry,
  deleteDraft,
  type EntryListItem,
} from "@/lib/entries.functions";
import { suggestPeople, createPerson } from "@/lib/people.functions";
import { MarkdownBody } from "@/components/portal/MarkdownBody";
import { relativeTime, formatCallDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/projects/$projectId/")({
  component: IntelligenceTab,
});

function IntelligenceTab() {
  const { projectId } = Route.useParams();
  const qc = useQueryClient();
  const list = useQuery({
    queryKey: ["project-entries", projectId],
    queryFn: () => listProjectEntries({ data: { projectId } }),
  });
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);

  const create = useMutation({
    mutationFn: useServerFn(createDraft),
    onSuccess: (res: { id: string }) => {
      qc.invalidateQueries({ queryKey: ["project-entries", projectId] });
      setActiveDraftId(res.id);
      setComposerOpen(true);
    },
  });

  const activeDraft = useMemo(
    () => list.data?.myDrafts.find((d) => d.id === activeDraftId) ?? null,
    [list.data, activeDraftId],
  );

  if (list.isLoading) {
    return <p className="text-[13px]" style={{ color: "var(--text-faint)" }}>Loading…</p>;
  }
  const drafts = list.data?.myDrafts ?? [];
  const published = list.data?.published ?? [];

  return (
    <div className="space-y-8">
      <div
        className="rounded-xl"
        style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
      >
        {!composerOpen || !activeDraft ? (
          <button
            onClick={() => create.mutate({ data: { projectId } })}
            disabled={create.isPending}
            className="block w-full px-5 py-4 text-left text-[14px]"
            style={{ color: "var(--text-muted)" }}
          >
            + Add intelligence
          </button>
        ) : (
          <EntryComposer
            key={activeDraft.id}
            projectId={projectId}
            draft={activeDraft}
            onClose={() => setComposerOpen(false)}
            onDeleted={() => {
              setActiveDraftId(null);
              setComposerOpen(false);
            }}
            onPublished={() => {
              setActiveDraftId(null);
              setComposerOpen(false);
            }}
          />
        )}
      </div>

      {drafts.length > 0 && (
        <section>
          <h2
            className="mb-3 text-[12px] font-medium uppercase tracking-wider"
            style={{ color: "var(--text-faint)" }}
          >
            Your drafts
          </h2>
          <div className="space-y-2">
            {drafts.map((d) => (
              <button
                key={d.id}
                onClick={() => {
                  setActiveDraftId(d.id);
                  setComposerOpen(true);
                }}
                className="block w-full rounded-lg px-4 py-3 text-left"
                style={{ background: "var(--surface)", border: "1px dashed var(--border)" }}
              >
                <div className="text-[14px]" style={{ color: "var(--text)" }}>{d.title}</div>
                <div className="mt-0.5 text-[11px]" style={{ color: "var(--text-faint)" }}>
                  Draft · only you see this · {relativeTime(d.updatedAt)}
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2
          className="mb-3 text-[12px] font-medium uppercase tracking-wider"
          style={{ color: "var(--text-faint)" }}
        >
          Published
        </h2>
        {published.length === 0 ? (
          <p className="text-[13px]" style={{ color: "var(--text-faint)" }}>
            Nothing published yet. Add intelligence to share with your project.
          </p>
        ) : (
          <div className="space-y-8">
            {published.map((e) => <PublishedEntry key={e.id} e={e} />)}
          </div>
        )}
      </section>
    </div>
  );
}

function PublishedEntry({ e }: { e: EntryListItem }) {
  return (
    <article className="border-b pb-8" style={{ borderColor: "var(--border)" }}>
      <h3 className="text-[20px] font-medium" style={{ color: "var(--text)" }}>{e.title}</h3>
      <div className="mt-1 text-[12px]" style={{ color: "var(--text-faint)" }}>
        {e.entryDate ? formatCallDate(e.entryDate) : relativeTime(e.publishedAt)}
        {e.authorName ? ` · ${e.authorName}` : ""}
        {e.people.length > 0 ? ` · ${e.people.map((p) => p.fullName).join(", ")}` : ""}
      </div>
      <div className="mt-4">
        <MarkdownBody body={e.body} />
      </div>
    </article>
  );
}

function EntryComposer({
  projectId,
  draft,
  onClose,
  onDeleted,
  onPublished,
}: {
  projectId: string;
  draft: EntryListItem;
  onClose: () => void;
  onDeleted: () => void;
  onPublished: () => void;
}) {
  const qc = useQueryClient();
  const [title, setTitle] = useState(draft.title);
  const [entryDate, setEntryDate] = useState(draft.entryDate ?? "");
  const [body, setBody] = useState(draft.body);
  const [people, setPeople] = useState<{ id: string; fullName: string; isNew?: boolean }[]>(
    draft.people,
  );
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const update = useMutation({
    mutationFn: useServerFn(updateDraft),
    onSuccess: () => {
      setSavedAt(Date.now());
      qc.invalidateQueries({ queryKey: ["project-entries", projectId] });
    },
  });
  const publish = useMutation({
    mutationFn: useServerFn(publishEntry),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project-entries", projectId] });
      qc.invalidateQueries({ queryKey: ["latest-entries"] });
      onPublished();
    },
  });
  const remove = useMutation({
    mutationFn: useServerFn(deleteDraft),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project-entries", projectId] });
      onDeleted();
    },
  });

  const save = (patch: {
    title?: string;
    entryDate?: string | null;
    body?: string;
    peopleIds?: string[];
  }) => update.mutate({ data: { id: draft.id, ...patch } });

  const handlePublish = () =>
    update.mutate(
      {
        data: {
          id: draft.id,
          title: title.trim() || "Untitled",
          entryDate: entryDate || null,
          body,
          peopleIds: people.map((p) => p.id),
        },
      },
      { onSuccess: () => publish.mutate({ data: { id: draft.id } }) },
    );

  const canPublish = title.trim().length > 0 && body.trim().length > 0;

  return (
    <div className="px-5 py-5">
      <div className="mb-4 flex items-center justify-between text-[11px]" style={{ color: "var(--text-faint)" }}>
        <span>{update.isPending ? "Saving…" : savedAt ? `Saved ${relativeTime(new Date(savedAt).toISOString())}` : "Draft — only you see this"}</span>
        <div className="flex gap-3">
          <button onClick={() => remove.mutate({ data: { id: draft.id } })}>Delete</button>
          <button onClick={onClose}>Collapse</button>
        </div>
      </div>

      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={() => save({ title: title.trim() || "Untitled" })}
        placeholder="Title"
        className="block w-full bg-transparent text-[24px] font-medium leading-tight outline-none"
        style={{ color: "var(--text)" }}
      />

      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3 border-y py-3" style={{ borderColor: "var(--border)" }}>
        <label className="flex items-center gap-2 text-[12px]" style={{ color: "var(--text-faint)" }}>
          <span>Date</span>
          <input
            type="date"
            value={entryDate}
            onChange={(e) => setEntryDate(e.target.value)}
            onBlur={() => save({ entryDate: entryDate || null })}
            className="rounded-md bg-transparent px-2 py-1 text-[13px] outline-none"
            style={{ border: "1px solid var(--border)", color: "var(--text)" }}
          />
        </label>
        <div className="flex flex-1 items-center gap-2 text-[12px] min-w-[260px]" style={{ color: "var(--text-faint)" }}>
          <span>Participants</span>
          <TagInput
            projectId={projectId}
            tags={people}
            onChange={(next) => {
              setPeople(next);
              save({ peopleIds: next.map((p) => p.id) });
            }}
          />
        </div>
      </div>

      <BodyEditor value={body} onChange={setBody} onCommit={() => save({ body })} />

      <div className="mt-6 flex items-center justify-end gap-3">
        <button
          onClick={() =>
            save({
              title: title.trim() || "Untitled",
              entryDate: entryDate || null,
              body,
              peopleIds: people.map((p) => p.id),
            })
          }
          disabled={update.isPending}
          className="h-10 rounded-md px-4 text-[13px] disabled:opacity-50"
          style={{ background: "var(--surface-raised)", border: "1px solid var(--border)", color: "var(--text)" }}
        >
          Save draft — only you see it
        </button>
        <button
          onClick={handlePublish}
          disabled={!canPublish || publish.isPending || update.isPending}
          className="h-10 rounded-md px-5 text-[13px] font-medium disabled:opacity-50"
          style={{ background: "var(--text)", color: "#000" }}
        >
          {publish.isPending ? "Publishing…" : "Publish to project"}
        </button>
      </div>
    </div>
  );
}

function BodyEditor({ value, onChange, onCommit }: { value: string; onChange: (v: string) => void; onCommit: () => void }) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.max(el.scrollHeight, 240) + "px";
  }, [value]);
  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onCommit}
      placeholder="Write the entry. Markdown supported."
      className="mt-4 block w-full resize-none bg-transparent text-[15px] leading-[1.6] outline-none"
      style={{ color: "var(--text)", minHeight: 240 }}
    />
  );
}

function TagInput({
  projectId,
  tags,
  onChange,
}: {
  projectId: string;
  tags: { id: string; fullName: string; isNew?: boolean }[];
  onChange: (next: { id: string; fullName: string; isNew?: boolean }[]) => void;
}) {
  const [q, setQ] = useState("");
  const [focus, setFocus] = useState(false);
  const sug = useQuery({
    queryKey: ["people-suggest", projectId, q],
    queryFn: () => suggestPeople({ data: { projectId, query: q } }),
    enabled: focus,
  });
  const create = useMutation({ mutationFn: useServerFn(createPerson) });

  const have = new Set(tags.map((t) => t.id));
  const suggestions = (sug.data ?? []).filter((s) => !have.has(s.id));

  const addExisting = (p: { id: string; fullName: string }) => {
    onChange([...tags, p]);
    setQ("");
  };
  const addNewFromInput = async () => {
    const name = q.trim();
    if (!name) return;
    const exact = suggestions.find((s) => s.fullName.toLowerCase() === name.toLowerCase());
    if (exact) return addExisting(exact);
    const res = await create.mutateAsync({ data: { projectId, fullName: name } });
    onChange([...tags, { id: res.id, fullName: res.fullName, isNew: true }]);
    setQ("");
  };

  return (
    <div className="relative flex flex-1 flex-wrap items-center gap-2">
      {tags.map((t) => (
        <span
          key={t.id}
          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px]"
          style={{ background: "var(--surface-raised)", color: "var(--text)" }}
        >
          {t.fullName}
          {t.isNew && <span style={{ color: "var(--text-faint)" }}>(new)</span>}
          <button
            onClick={() => onChange(tags.filter((x) => x.id !== t.id))}
            style={{ color: "var(--text-faint)" }}
          >
            ×
          </button>
        </span>
      ))}
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => setFocus(true)}
        onBlur={() => setTimeout(() => setFocus(false), 150)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            addNewFromInput();
          }
        }}
        placeholder={tags.length === 0 ? "Add people" : ""}
        className="flex-1 bg-transparent text-[13px] outline-none min-w-[120px]"
        style={{ color: "var(--text)" }}
      />
      {focus && (suggestions.length > 0 || q.trim().length > 0) && (
        <ul
          className="absolute top-full left-0 z-10 mt-1 w-full rounded-md py-1"
          style={{ background: "var(--surface-raised)", border: "1px solid var(--border)" }}
        >
          {suggestions.map((s) => (
            <li key={s.id}>
              <button
                onMouseDown={(e) => {
                  e.preventDefault();
                  addExisting(s);
                }}
                className="block w-full px-3 py-1.5 text-left text-[13px]"
                style={{ color: "var(--text)" }}
              >
                {s.fullName}
              </button>
            </li>
          ))}
          {q.trim().length > 0 &&
            !suggestions.some((s) => s.fullName.toLowerCase() === q.trim().toLowerCase()) && (
              <li>
                <button
                  onMouseDown={(e) => {
                    e.preventDefault();
                    addNewFromInput();
                  }}
                  className="block w-full px-3 py-1.5 text-left text-[13px]"
                  style={{ color: "var(--text-muted)" }}
                >
                  + Add "{q.trim()}"
                </button>
              </li>
            )}
        </ul>
      )}
    </div>
  );
}
