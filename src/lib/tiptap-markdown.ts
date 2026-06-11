/**
 * Minimal markdown ↔ Tiptap doc converters.
 * Supports: paragraphs, h1/h2/h3, bullet list, bold, and mention tokens.
 * Mention token (stored as): @[Full Name](person:uuid)
 */

type Node = { type: string; attrs?: any; content?: Node[]; text?: string; marks?: any[] };

const MENTION_RE = /@\[([^\]]+)\]\(person:([0-9a-f-]{36})\)/gi;

function inlineToNodes(line: string): Node[] {
  // Find mentions first, then bold within remaining text segments.
  const nodes: Node[] = [];
  let lastIndex = 0;
  for (const match of line.matchAll(MENTION_RE)) {
    const idx = match.index ?? 0;
    if (idx > lastIndex) nodes.push(...textWithBold(line.slice(lastIndex, idx)));
    nodes.push({
      type: "mention",
      attrs: { id: match[2], label: match[1] },
    });
    lastIndex = idx + match[0].length;
  }
  if (lastIndex < line.length) nodes.push(...textWithBold(line.slice(lastIndex)));
  return nodes;
}

function textWithBold(text: string): Node[] {
  if (!text) return [];
  const out: Node[] = [];
  const re = /\*\*(.+?)\*\*/g;
  let last = 0;
  for (const m of text.matchAll(re)) {
    const i = m.index ?? 0;
    if (i > last) out.push({ type: "text", text: text.slice(last, i) });
    out.push({ type: "text", text: m[1], marks: [{ type: "bold" }] });
    last = i + m[0].length;
  }
  if (last < text.length) out.push({ type: "text", text: text.slice(last) });
  return out;
}

export function markdownToDoc(markdown: string): Node {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const content: Node[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === "") {
      i++;
      continue;
    }
    if (line.startsWith("### ")) {
      content.push({ type: "heading", attrs: { level: 3 }, content: inlineToNodes(line.slice(4)) });
      i++;
      continue;
    }
    if (line.startsWith("## ")) {
      content.push({ type: "heading", attrs: { level: 2 }, content: inlineToNodes(line.slice(3)) });
      i++;
      continue;
    }
    if (line.startsWith("# ")) {
      content.push({ type: "heading", attrs: { level: 1 }, content: inlineToNodes(line.slice(2)) });
      i++;
      continue;
    }
    if (/^[-*] /.test(line)) {
      const items: Node[] = [];
      while (i < lines.length && /^[-*] /.test(lines[i])) {
        items.push({
          type: "listItem",
          content: [{ type: "paragraph", content: inlineToNodes(lines[i].replace(/^[-*] /, "")) }],
        });
        i++;
      }
      content.push({ type: "bulletList", content: items });
      continue;
    }
    // Paragraph: collect contiguous non-empty lines (each line break ignored).
    const para: string[] = [line];
    i++;
    while (i < lines.length && lines[i].trim() !== "" && !/^([#]{1,3} |[-*] )/.test(lines[i])) {
      para.push(lines[i]);
      i++;
    }
    content.push({ type: "paragraph", content: inlineToNodes(para.join(" ")) });
  }
  if (content.length === 0) content.push({ type: "paragraph" });
  return { type: "doc", content };
}

function serializeInline(nodes: Node[] | undefined): string {
  if (!nodes) return "";
  return nodes
    .map((n) => {
      if (n.type === "mention") {
        const id = n.attrs?.id ?? "";
        const label = n.attrs?.label ?? "";
        return `@[${label}](person:${id})`;
      }
      if (n.type === "text") {
        const text = n.text ?? "";
        const bold = (n.marks ?? []).some((m: any) => m.type === "bold");
        return bold ? `**${text}**` : text;
      }
      if (n.type === "hardBreak") return "\n";
      return "";
    })
    .join("");
}

export function docToMarkdown(doc: any): string {
  if (!doc || !doc.content) return "";
  const out: string[] = [];
  for (const node of doc.content as Node[]) {
    if (node.type === "paragraph") {
      out.push(serializeInline(node.content));
    } else if (node.type === "heading") {
      const level = Math.min(3, Math.max(1, node.attrs?.level ?? 1));
      out.push(`${"#".repeat(level)} ${serializeInline(node.content)}`);
    } else if (node.type === "bulletList") {
      const items: string[] = [];
      for (const li of node.content ?? []) {
        const para = li.content?.[0];
        items.push(`- ${serializeInline(para?.content)}`);
      }
      out.push(items.join("\n"));
    } else if (node.type === "orderedList") {
      const items: string[] = [];
      let n = 1;
      for (const li of node.content ?? []) {
        const para = li.content?.[0];
        items.push(`${n++}. ${serializeInline(para?.content)}`);
      }
      out.push(items.join("\n"));
    }
  }
  return out.join("\n\n").trim();
}

export function extractMentionIds(doc: any): string[] {
  const ids = new Set<string>();
  const walk = (n: any) => {
    if (!n) return;
    if (n.type === "mention" && n.attrs?.id) ids.add(n.attrs.id);
    if (n.content) for (const c of n.content) walk(c);
  };
  walk(doc);
  return [...ids];
}
