import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { getGroup, renameGroup, deleteGroup } from "@/lib/groups.functions";
import { listGroupEntries, type EntryListItem } from "@/lib/entries.functions";
import { getProject } from "@/lib/projects.functions";
import { MarkdownBody } from "@/components/portal/MarkdownBody";
import { relativeTime, formatCallDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/projects/$projectId/groups/$groupId")({
  component: GroupPage,
});

function GroupPage() {
  const { projectId, groupId } = Route.useParams();
  const qc = useQueryClient();
  const router = useRouter();
  const project = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => getProject({ data: { id: projectId } }),
  });
  const group = useQuery({
    queryKey: ["group", projectId, groupId],
    queryFn: () => getGroup({ data: { projectId, groupId } }),
  });
  const entries = useQuery({
    queryKey: ["group-entries", projectId, groupId],
    queryFn: () => listGroupEntries({ data: { projectId, groupId } }),
  });

  const rename = useMutation({
    mutationFn: useServerFn(renameGroup),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["group", projectId, groupId] });
      qc.invalidateQueries({ queryKey: ["project-groups", projectId] });
      setMenuOpen(false);
      setRenaming(false);
    },
  });
  const remove = useMutation({
    mutationFn: useServerFn(deleteGroup),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project-groups", projectId] });
      router.navigate({ to: "/projects/$projectId/groups", params: { projectId } });
    },
  });

  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState("");

  if (group.isLoading || project.isLoading) return <p className="text-[13px]" style={{ color: "var(--text-faint)" }}>Loading…</p>;
  if (!group.data) return <p className="text-[13px]" style={{ color: "var(--text-faint)" }}>Not found.</p>;
  const canManage = project.data?.myRole === "owner" || project.data?.myRole === "co_owner";
  const list = entries.data ?? [];

  return (
    <div>
      <Link
        to="/projects/$projectId/groups"
        params={{ projectId }}
        className="text-[12px]"
        style={{ color: "var(--text-faint)" }}
      >
        ← Groups
      </Link>
      <div className="mt-3 flex items-center justify-between">
        {!renaming ? (
          <h2 className="text-[22px] font-medium" style={{ color: "var(--text)" }}>{group.data.name}</h2>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (name.trim()) rename.mutate({ data: { projectId, groupId, name: name.trim() } });
            }}
            className="flex items-center gap-2"
          >
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={group.data.name}
              className="rounded-md px-3 py-1.5 text-[20px] outline-none"
              style={{ background: "var(--surface-raised)", border: "1px solid var(--border)", color: "var(--text)" }}
            />
            <button type="submit" className="text-[12px]" style={{ color: "var(--text)" }}>Save</button>
            <button type="button" onClick={() => setRenaming(false)} className="text-[12px]" style={{ color: "var(--text-faint)" }}>Cancel</button>
          </form>
        )}
        {canManage && !renaming && (
          <div className="relative">
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="text-[16px]"
              style={{ color: "var(--text-faint)" }}
            >
              ⋯
            </button>
            {menuOpen && (
              <div
                className="absolute right-0 top-full z-10 mt-1 rounded-md py-1"
                style={{ background: "var(--surface-raised)", border: "1px solid var(--border)", minWidth: 140 }}
              >
                <button
                  onClick={() => { setRenaming(true); setName(group.data!.name); setMenuOpen(false); }}
                  className="block w-full px-3 py-1.5 text-left text-[13px]"
                  style={{ color: "var(--text)" }}
                >
                  Rename
                </button>
                <button
                  onClick={() => {
                    if (confirm("Delete this group? Entries are kept.")) {
                      remove.mutate({ data: { projectId, groupId } });
                    }
                  }}
                  className="block w-full px-3 py-1.5 text-left text-[13px]"
                  style={{ color: "var(--destructive)" }}
                >
                  Delete
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="mt-6 space-y-8">
        {list.length === 0 ? (
          <p className="text-[13px]" style={{ color: "var(--text-faint)" }}>No published entries in this group yet.</p>
        ) : (
          list.map((e) => <GroupEntry key={e.id} e={e} />)
        )}
      </div>
    </div>
  );
}

function GroupEntry({ e }: { e: EntryListItem }) {
  return (
    <article className="border-b pb-8" style={{ borderColor: "var(--border)" }}>
      <h3 className="text-[18px] font-medium" style={{ color: "var(--text)" }}>{e.title}</h3>
      <div className="mt-1 text-[12px]" style={{ color: "var(--text-faint)" }}>
        {e.entryDate ? formatCallDate(e.entryDate) : relativeTime(e.publishedAt)}
        {e.authorName ? ` · ${e.authorName}` : ""}
        {e.participants.length > 0 ? ` · ${e.participants.map((p) => p.fullName).join(", ")}` : ""}
        {e.tags.length > 0 ? ` · tags: ${e.tags.map((t) => t.name).join(", ")}` : ""}
      </div>
      <div className="mt-4">
        <MarkdownBody body={e.body} />
      </div>
    </article>
  );
}
