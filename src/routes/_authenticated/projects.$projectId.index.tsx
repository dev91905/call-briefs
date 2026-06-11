import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import {
  listProjectEntries,
  listFilteredEntries,
  createDraft,
  updateDraft,
  publishEntry,
  deleteDraft,
  duplicateDraft,
  type EntryListItem,
} from "@/lib/entries.functions";
import { suggestPeople, createPerson } from "@/lib/people.functions";
import { suggestGroups, createGroup } from "@/lib/groups.functions";
import { suggestTags, createTag, topTagThisMonth, listProjectTags } from "@/lib/tags.functions";
import { listProjectGroups } from "@/lib/groups.functions";
import { MarkdownBody } from "@/components/portal/MarkdownBody";
import { relativeTime, formatCallDate } from "@/lib/format";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
} from "@/components/ui/context-menu";
import { TiptapBodyEditor } from "@/components/portal/TiptapBodyEditor";
import { extractMentionIds } from "@/lib/tiptap-markdown";

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
  const topTag = useQuery({
    queryKey: ["top-tag", projectId],
    queryFn: () => topTagThisMonth({ data: { projectId } }),
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

  // Filter state
  const [filterTagIds, setFilterTagIds] = useState<string[]>([]);
  const [filterGroupIds, setFilterGroupIds] = useState<string[]>([]);
  const filterActive = filterTagIds.length + filterGroupIds.length > 0;
  const filtered = useQuery({
    queryKey: ["filtered-entries", projectId, filterTagIds, filterGroupIds],
    queryFn: () =>
      listFilteredEntries({
        data: { projectId, tagIds: filterTagIds, groupIds: filterGroupIds },
      }),
    enabled: filterActive,
  });

  if (list.isLoading) {
    return <p className="text-[13px]" style={{ color: "var(--text-faint)" }}>Loading…</p>;
  }
  const drafts = list.data?.myDrafts ?? [];
  const published = filterActive ? (filtered.data ?? []) : (list.data?.published ?? []);

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
              <DraftRow
                key={d.id}
                draft={d}
                projectId={projectId}
                onOpen={() => {
                  setActiveDraftId(d.id);
                  setComposerOpen(true);
                }}
              />
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2
            className="text-[12px] font-medium uppercase tracking-wider"
            style={{ color: "var(--text-faint)" }}
          >
            Published
          </h2>
          <div className="flex items-center gap-3">
            {topTag.data && (
              <span className="text-[12px]" style={{ color: "var(--text-faint)" }}>
                Most active this month: <span style={{ color: "var(--text-muted)" }}>{topTag.data.name}</span>
              </span>
            )}
            <FeedFilter
              projectId={projectId}
              tagIds={filterTagIds}
              groupIds={filterGroupIds}
              onTagsChange={setFilterTagIds}
              onGroupsChange={setFilterGroupIds}
            />
          </div>
        </div>
        {published.length === 0 ? (
          <p className="text-[13px]" style={{ color: "var(--text-faint)" }}>
            {filterActive ? "No published entries match." : "Nothing published yet. Add intelligence to share with your project."}
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

function DraftRow({
  draft,
  projectId,
  onOpen,
}: {
  draft: EntryListItem;
  projectId: string;
  onOpen: () => void;
}) {
  const qc = useQueryClient();
  const dup = useMutation({
    mutationFn: useServerFn(duplicateDraft),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["project-entries", projectId] }),
  });
  const remove = useMutation({
    mutationFn: useServerFn(deleteDraft),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["project-entries", projectId] }),
  });
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <button
          onClick={onOpen}
          className="block w-full rounded-lg px-4 py-3 text-left"
          style={{ background: "var(--surface)", border: "1px dashed var(--border)" }}
        >
          <div className="text-[14px]" style={{ color: "var(--text)" }}>{draft.title}</div>
          <div className="mt-0.5 text-[11px]" style={{ color: "var(--text-faint)" }}>
            Draft · only you see this · {relativeTime(draft.updatedAt)}
          </div>
        </button>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onSelect={() => dup.mutate({ data: { id: draft.id } })}>Duplicate</ContextMenuItem>
        <ContextMenuItem
          onSelect={() => {
            if (confirm("Delete this draft?")) remove.mutate({ data: { id: draft.id } });
          }}
        >
          Delete draft
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

function PublishedEntry({ e }: { e: EntryListItem }) {
  const [open, setOpen] = useState(false);
  const projectId = e.projectId;
  return (
    <article
      onClick={() => !open && setOpen(true)}
      className="rounded-xl p-5"
      style={{
        background: "var(--surface)",
        border: `1px solid ${open ? "var(--text-faint)" : "var(--border)"}`,
        cursor: open ? "default" : "pointer",
        position: "relative",
      }}
    >
      {open && (
        <button
          onClick={(ev) => { ev.stopPropagation(); setOpen(false); }}
          className="absolute right-4 top-4 text-[11px]"
          style={{ color: "var(--text-faint)" }}
        >
          Collapse ✕
        </button>
      )}
      <h3 className="text-[20px] font-medium" style={{ color: "var(--text)" }}>{e.title}</h3>
      <div className="mt-1 text-[12px]" style={{ color: "var(--text-faint)" }}>
        {e.entryDate ? formatCallDate(e.entryDate) : relativeTime(e.publishedAt)}
        {e.authorName ? ` · ${e.authorName}` : ""}
        {e.participants.length > 0 && (
          <>
            {" · "}
            {e.participants.map((p, i) => (
              <span key={p.id}>
                {i > 0 && ", "}
                <Link
                  to="/projects/$projectId/people/$personId"
                  params={{ projectId, personId: p.id }}
                  onClick={(ev) => ev.stopPropagation()}
                  className="ref-link"
                >
                  {p.fullName}
                </Link>
              </span>
            ))}
          </>
        )}
        {e.tags.length > 0 ? ` · tags: ${e.tags.map((t) => t.name).join(", ")}` : ""}
        {e.groups.length > 0 && (
          <>
            {" · groups: "}
            {e.groups.map((g, i) => (
              <span key={g.id}>
                {i > 0 && ", "}
                <Link
                  to="/projects/$projectId/groups/$groupId"
                  params={{ projectId, groupId: g.id }}
                  onClick={(ev) => ev.stopPropagation()}
                  className="ref-link"
                >
                  {g.name}
                </Link>
              </span>
            ))}
          </>
        )}
      </div>
      {e.dek && !open && (
        <p className="mt-3 text-[14px]" style={{ color: "var(--text-muted)" }}>{e.dek}</p>
      )}
      {open && (
        <div className="mt-4" onClick={(ev) => ev.stopPropagation()}>
          {e.dek && (
            <p className="mb-4 text-[15px]" style={{ color: "var(--text-muted)" }}>{e.dek}</p>
          )}
          <MarkdownBody body={e.body} />
        </div>
      )}
    </article>
  );
}

function FeedFilter({
  projectId,
  tagIds,
  groupIds,
  onTagsChange,
  onGroupsChange,
}: {
  projectId: string;
  tagIds: string[];
  groupIds: string[];
  onTagsChange: (ids: string[]) => void;
  onGroupsChange: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const tags = useQuery({
    queryKey: ["project-tags", projectId],
    queryFn: () => listProjectTags({ data: { projectId } }),
    enabled: open,
  });
  const groups = useQuery({
    queryKey: ["project-groups", projectId],
    queryFn: () => listProjectGroups({ data: { projectId } }),
    enabled: open,
  });

  const tagList = (tags.data ?? []).filter((t) => t.name.toLowerCase().includes(q.toLowerCase()));
  const groupList = (groups.data ?? []).filter((g) => g.name.toLowerCase().includes(q.toLowerCase()));

  const toggle = (set: string[], id: string, fn: (v: string[]) => void) =>
    fn(set.includes(id) ? set.filter((x) => x !== id) : [...set, id]);

  return (
    <div className="flex items-center gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            className="rounded-md px-3 py-1.5 text-[12px]"
            style={{ background: "var(--surface-raised)", border: "1px solid var(--border)", color: "var(--text)" }}
          >
            Filter{tagIds.length + groupIds.length > 0 ? ` (${tagIds.length + groupIds.length})` : ""}
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72 p-3">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search"
            className="mb-2 block w-full rounded-md px-2 py-1 text-[12px] outline-none"
            style={{ background: "var(--surface-raised)", border: "1px solid var(--border)", color: "var(--text)" }}
          />
          <div className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-faint)" }}>Tags</div>
          <div className="mb-2 max-h-40 overflow-auto">
            {tagList.length === 0 ? (
              <p className="px-1 py-0.5 text-[12px]" style={{ color: "var(--text-faint)" }}>—</p>
            ) : (
              tagList.map((t) => (
                <label key={t.id} className="flex items-center gap-2 px-1 py-0.5 text-[12px]" style={{ color: "var(--text)" }}>
                  <input
                    type="checkbox"
                    checked={tagIds.includes(t.id)}
                    onChange={() => toggle(tagIds, t.id, onTagsChange)}
                  />
                  {t.name}
                </label>
              ))
            )}
          </div>
          <div className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-faint)" }}>Groups</div>
          <div className="max-h-40 overflow-auto">
            {groupList.length === 0 ? (
              <p className="px-1 py-0.5 text-[12px]" style={{ color: "var(--text-faint)" }}>—</p>
            ) : (
              groupList.map((g) => (
                <label key={g.id} className="flex items-center gap-2 px-1 py-0.5 text-[12px]" style={{ color: "var(--text)" }}>
                  <input
                    type="checkbox"
                    checked={groupIds.includes(g.id)}
                    onChange={() => toggle(groupIds, g.id, onGroupsChange)}
                  />
                  {g.name}
                </label>
              ))
            )}
          </div>
        </PopoverContent>
      </Popover>
      {tagIds.map((id) => {
        const t = (tags.data ?? []).find((x) => x.id === id);
        if (!t) return null;
        return (
          <span key={id} className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px]" style={{ background: "var(--surface-raised)", color: "var(--text)" }}>
            {t.name}
            <button onClick={() => onTagsChange(tagIds.filter((x) => x !== id))} style={{ color: "var(--text-faint)" }}>×</button>
          </span>
        );
      })}
      {groupIds.map((id) => {
        const g = (groups.data ?? []).find((x) => x.id === id);
        if (!g) return null;
        return (
          <span key={id} className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px]" style={{ background: "var(--surface-raised)", color: "var(--text)" }}>
            {g.name}
            <button onClick={() => onGroupsChange(groupIds.filter((x) => x !== id))} style={{ color: "var(--text-faint)" }}>×</button>
          </span>
        );
      })}
    </div>
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
  const [participants, setParticipants] = useState<{ id: string; fullName: string; isNew?: boolean }[]>(
    draft.participants,
  );
  const [groups, setGroups] = useState<{ id: string; fullName: string; isNew?: boolean }[]>(
    draft.groups.map((g) => ({ id: g.id, fullName: g.name })),
  );
  const [tags, setTags] = useState<{ id: string; fullName: string; isNew?: boolean }[]>(
    draft.tags.map((t) => ({ id: t.id, fullName: t.name })),
  );
  const mentionedIdsRef = useRef<string[]>([]);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [dateOpen, setDateOpen] = useState(false);

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
    mentionedPeopleIds?: string[];
    groupIds?: string[];
    tagIds?: string[];
  }) => update.mutate({ data: { id: draft.id, ...patch } });

  const saveAll = () =>
    save({
      title: title.trim() || "Untitled",
      entryDate: entryDate || null,
      body,
      peopleIds: participants.map((p) => p.id),
      mentionedPeopleIds: mentionedIdsRef.current,
      groupIds: groups.map((g) => g.id),
      tagIds: tags.map((t) => t.id),
    });

  const handlePublish = () =>
    update.mutate(
      {
        data: {
          id: draft.id,
          title: title.trim() || "Untitled",
          entryDate: entryDate || null,
          body,
          peopleIds: participants.map((p) => p.id),
          mentionedPeopleIds: mentionedIdsRef.current,
          groupIds: groups.map((g) => g.id),
          tagIds: tags.map((t) => t.id),
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
          <button onClick={() => { if (confirm("Delete this draft?")) remove.mutate({ data: { id: draft.id } }); }}>Delete</button>
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

      <div className="mt-4 space-y-2 border-y py-3" style={{ borderColor: "var(--border)" }}>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <div className="flex items-center gap-2 text-[12px]" style={{ color: "var(--text-faint)" }}>
            <span>Date</span>
            <Popover open={dateOpen} onOpenChange={setDateOpen}>
              <PopoverTrigger asChild>
                <button
                  className="rounded-md px-2 py-1 text-[13px] outline-none"
                  style={{ border: "1px solid var(--border)", color: "var(--text)", background: "transparent" }}
                >
                  {entryDate ? format(new Date(entryDate + "T00:00:00"), "PP") : "Pick date"}
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={entryDate ? new Date(entryDate + "T00:00:00") : undefined}
                  onSelect={(d) => {
                    if (!d) return;
                    const iso = format(d, "yyyy-MM-dd");
                    setEntryDate(iso);
                    save({ entryDate: iso });
                    setDateOpen(false);
                  }}
                  initialFocus
                  className="p-3 pointer-events-auto"
                />
                <div className="border-t p-2" style={{ borderColor: "var(--border)" }}>
                  <button
                    onClick={() => {
                      const iso = format(new Date(), "yyyy-MM-dd");
                      setEntryDate(iso);
                      save({ entryDate: iso });
                      setDateOpen(false);
                    }}
                    className="block w-full rounded-md px-2 py-1 text-left text-[12px]"
                    style={{ color: "var(--text)" }}
                  >
                    Set to today
                  </button>
                </div>
              </PopoverContent>
            </Popover>
          </div>
          <div className="flex flex-1 items-center gap-2 text-[12px] min-w-[260px]" style={{ color: "var(--text-faint)" }}>
            <span>Participants</span>
            <TagInput
              projectId={projectId}
              kind="people"
              tags={participants}
              onChange={(next) => {
                setParticipants(next);
                save({ peopleIds: next.map((p) => p.id) });
              }}
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <div className="flex flex-1 items-center gap-2 text-[12px] min-w-[200px]" style={{ color: "var(--text-faint)" }}>
            <span>Group</span>
            <TagInput
              projectId={projectId}
              kind="groups"
              tags={groups}
              onChange={(next) => {
                setGroups(next);
                save({ groupIds: next.map((g) => g.id) });
              }}
            />
          </div>
          <div className="flex flex-1 items-center gap-2 text-[12px] min-w-[200px]" style={{ color: "var(--text-faint)" }}>
            <span>Tags</span>
            <TagInput
              projectId={projectId}
              kind="tags"
              tags={tags}
              onChange={(next) => {
                setTags(next);
                save({ tagIds: next.map((t) => t.id) });
              }}
            />
          </div>
        </div>
      </div>

      <TiptapBodyEditor
        projectId={projectId}
        initialMarkdown={body}
        onChange={(md, doc) => {
          setBody(md);
          mentionedIdsRef.current = extractMentionIds(doc);
        }}
        onCommit={() => saveAll()}
      />

      <div className="mt-6 flex items-center justify-end gap-3">
        <button
          onClick={saveAll}
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
          {publish.isPending ? "Publishing…" : "Publish to project"}
        </button>
      </div>
    </div>
  );
}

function TagInput({
  projectId,
  kind,
  tags,
  onChange,
}: {
  projectId: string;
  kind: "people" | "groups" | "tags";
  tags: { id: string; fullName: string; isNew?: boolean }[];
  onChange: (next: { id: string; fullName: string; isNew?: boolean }[]) => void;
}) {
  const [q, setQ] = useState("");
  const [focus, setFocus] = useState(false);
  const suggestFn = kind === "people" ? suggestPeople : kind === "groups" ? suggestGroups : suggestTags;
  const createFn = kind === "people" ? createPerson : kind === "groups" ? createGroup : createTag;

  const sug = useQuery({
    queryKey: [`${kind}-suggest`, projectId, q],
    queryFn: () => suggestFn({ data: { projectId, query: q } as any }),
    enabled: focus,
  });
  const create = useMutation({ mutationFn: useServerFn(createFn as any) });

  const have = new Set(tags.map((t) => t.id));
  const suggestions = ((sug.data ?? []) as { id: string; fullName: string }[]).filter((s) => !have.has(s.id));

  const addExisting = (p: { id: string; fullName: string }) => {
    onChange([...tags, p]);
    setQ("");
  };
  const addNewFromInput = async () => {
    const name = q.trim();
    if (!name) return;
    const exact = suggestions.find((s) => s.fullName.toLowerCase() === name.toLowerCase());
    if (exact) return addExisting(exact);
    const args = kind === "people"
      ? { projectId, fullName: name }
      : kind === "groups"
      ? { projectId, name }
      : { projectId, name };
    const res = (await create.mutateAsync({ data: args as any })) as { id: string; fullName: string };
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
        placeholder={tags.length === 0 ? `Add ${kind === "groups" ? "group" : kind === "tags" ? "tags" : "people"}` : ""}
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
