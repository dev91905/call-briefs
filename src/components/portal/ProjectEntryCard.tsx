import { Link } from "@tanstack/react-router";
import { useState } from "react";
import type { EntryListItem } from "@/lib/entries.functions";
import { MarkdownBody } from "@/components/portal/MarkdownBody";
import { formatCallDate, relativeTime } from "@/lib/format";

export function ProjectEntryCard({
  e,
  personRole,
}: {
  e: EntryListItem;
  personRole?: "participant" | "mentioned";
}) {
  const [open, setOpen] = useState(false);

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
          onClick={(ev) => {
            ev.stopPropagation();
            setOpen(false);
          }}
          className="absolute right-4 top-4 text-[11px]"
          style={{ color: "var(--text-faint)" }}
        >
          Collapse ✕
        </button>
      )}

      <h3 className="pr-16 text-[20px] font-medium" style={{ color: "var(--text)" }}>
        {e.title}
      </h3>

      <EntryMetaLine e={e} personRole={personRole} />

      {e.dek && !open && (
        <p className="mt-3 text-[14px]" style={{ color: "var(--text-muted)" }}>
          {e.dek}
        </p>
      )}

      {open && (
        <div className="mt-4" onClick={(ev) => ev.stopPropagation()}>
          {e.dek && (
            <p className="mb-4 text-[15px]" style={{ color: "var(--text-muted)" }}>
              {e.dek}
            </p>
          )}
          <MarkdownBody body={e.body} />
        </div>
      )}
    </article>
  );
}

function EntryMetaLine({
  e,
  personRole,
}: {
  e: EntryListItem;
  personRole?: "participant" | "mentioned";
}) {
  return (
    <div className="mt-1 text-[12px]" style={{ color: "var(--text-faint)" }}>
      {e.entryDate ? formatCallDate(e.entryDate) : relativeTime(e.publishedAt)}
      {e.authorName ? ` · ${e.authorName}` : ""}
      {personRole ? ` · ${personRole}` : ""}
      {e.participants.length > 0 && (
        <>
          {" · "}
          {e.participants.map((p, i) => (
            <span key={p.id}>
              {i > 0 && ", "}
              <Link
                to="/projects/$projectId/people/$personId"
                params={{ projectId: e.projectId, personId: p.id }}
                onClick={(ev: any) => ev.stopPropagation()}
                className="ref-link"
              >
                {p.fullName}
              </Link>
            </span>
          ))}
        </>
      )}
      {e.groups.length > 0 && (
        <>
          {" · groups: "}
          {e.groups.map((g, i) => (
            <span key={g.id}>
              {i > 0 && ", "}
              <Link
                to="/projects/$projectId/groups/$groupId"
                params={{ projectId: e.projectId, groupId: g.id }}
                onClick={(ev: any) => ev.stopPropagation()}
                className="ref-link"
              >
                {g.name}
              </Link>
            </span>
          ))}
        </>
      )}
      {e.tags.length > 0 ? ` · tags: ${e.tags.map((t) => t.name).join(", ")}` : ""}
    </div>
  );
}