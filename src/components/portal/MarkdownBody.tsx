/**
 * Markdown renderer for published entries.
 * Supports: paragraphs, h1/h2/h3, bullet lists, **bold**, and @[Name](person:uuid) mentions.
 * Everything else is escaped.
 */

import { Link, useParams } from "@tanstack/react-router";
import type { ReactNode } from "react";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const MENTION_RE = /@\[([^\]]+)\]\(person:([0-9a-f-]{36})\)/gi;

function renderInline(text: string, projectId: string | undefined): ReactNode[] {
  // Split by mentions first; within each non-mention piece, render bold inline HTML.
  const parts: ReactNode[] = [];
  let last = 0;
  let key = 0;
  for (const m of text.matchAll(MENTION_RE)) {
    const i = m.index ?? 0;
    if (i > last) parts.push(renderBold(text.slice(last, i), key++));
    const label = m[1];
    const personId = m[2];
    if (projectId) {
      parts.push(
        <Link
          key={`m-${key++}`}
          to="/projects/$projectId/people/$personId"
          params={{ projectId, personId }}
          className="rounded px-1"
          style={{ background: "var(--surface-raised)", color: "var(--text)", textDecoration: "none" }}
        >
          @{label}
        </Link>,
      );
    } else {
      parts.push(
        <span key={`m-${key++}`} className="rounded px-1" style={{ background: "var(--surface-raised)" }}>
          @{label}
        </span>,
      );
    }
    last = i + m[0].length;
  }
  if (last < text.length) parts.push(renderBold(text.slice(last), key++));
  return parts;
}

function renderBold(text: string, key: number): ReactNode {
  const escaped = escapeHtml(text).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  return <span key={`t-${key}`} dangerouslySetInnerHTML={{ __html: escaped }} />;
}

export function MarkdownBody({ body, className = "" }: { body: string; className?: string }) {
  const params = useParams({ strict: false }) as { projectId?: string };
  const projectId = params.projectId;

  const blocks = body.replace(/\r\n/g, "\n").split(/\n{2,}/);
  const out: ReactNode[] = [];

  blocks.forEach((block, bi) => {
    const trimmed = block.trim();
    if (!trimmed) return;

    if (trimmed.startsWith("### ")) {
      out.push(<h3 key={bi} className="mt-4 text-[16px] font-medium" style={{ color: "var(--text)" }}>{renderInline(trimmed.slice(4), projectId)}</h3>);
    } else if (trimmed.startsWith("## ")) {
      out.push(<h2 key={bi} className="mt-5 text-[18px] font-medium" style={{ color: "var(--text)" }}>{renderInline(trimmed.slice(3), projectId)}</h2>);
    } else if (trimmed.startsWith("# ")) {
      out.push(<h1 key={bi} className="mt-5 text-[20px] font-medium" style={{ color: "var(--text)" }}>{renderInline(trimmed.slice(2), projectId)}</h1>);
    } else if (/^[-*] /.test(trimmed)) {
      const items = trimmed
        .split("\n")
        .map((l) => l.replace(/^[-*] /, ""));
      out.push(
        <ul key={bi} className="my-2 list-disc pl-5" style={{ color: "var(--text)" }}>
          {items.map((it, i) => (
            <li key={i}>{renderInline(it, projectId)}</li>
          ))}
        </ul>,
      );
    } else {
      out.push(
        <p key={bi} style={{ marginBottom: 12 }}>
          {renderInline(trimmed, projectId)}
        </p>,
      );
    }
  });

  return (
    <div className={`brief-body ${className}`} style={{ fontSize: 15.5, lineHeight: 1.75, color: "var(--text)" }}>
      {out}
    </div>
  );
}
