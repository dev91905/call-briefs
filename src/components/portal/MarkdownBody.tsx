/**
 * Tiny safe Markdown renderer.
 * Supports: paragraphs and inline **bold** only. No HTML, no links, no headings, no lists.
 * Everything else is escaped.
 */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderInline(text: string): string {
  // Escape first, then apply **bold** to escaped text.
  const escaped = escapeHtml(text);
  return escaped.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
}

export function MarkdownBody({ body, className = "" }: { body: string; className?: string }) {
  const paragraphs = body
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  return (
    <div className={`brief-body ${className}`} style={{ fontSize: 15.5, lineHeight: 1.75, color: "var(--text)" }}>
      {paragraphs.map((p, i) => (
        <p
          key={i}
          style={{ marginBottom: i === paragraphs.length - 1 ? 0 : 12 }}
          dangerouslySetInnerHTML={{ __html: renderInline(p) }}
        />
      ))}
    </div>
  );
}
