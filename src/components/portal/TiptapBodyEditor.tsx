import { useEditor, EditorContent, ReactRenderer } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Typography from "@tiptap/extension-typography";
import Mention from "@tiptap/extension-mention";
import tippy, { type Instance } from "tippy.js";
import { useEffect, forwardRef, useImperativeHandle, useState } from "react";
import { markdownToDoc, docToMarkdown } from "@/lib/tiptap-markdown";
import { suggestPeople, createPerson } from "@/lib/people.functions";

type SuggestionItem = { id: string; fullName: string; isNew?: boolean };

export function TiptapBodyEditor({
  projectId,
  initialMarkdown,
  onChange,
  onCommit,
}: {
  projectId: string;
  initialMarkdown: string;
  onChange: (markdown: string, doc: any) => void;
  onCommit: () => void;
}) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Typography,
      Mention.configure({
        HTMLAttributes: { class: "tiptap-mention" },
        renderText({ node }) {
          return `@[${node.attrs.label ?? ""}](person:${node.attrs.id})`;
        },
        suggestion: {
          char: "@",
          items: async ({ query }) => {
            const results = await suggestPeople({ data: { projectId, query } });
            const items: SuggestionItem[] = results.slice(0, 6);
            if (query.trim().length > 0 && !items.some((i) => i.fullName.toLowerCase() === query.toLowerCase())) {
              items.push({ id: "__create__", fullName: query.trim(), isNew: true });
            }
            return items;
          },
          render: () => {
            let component: ReactRenderer<MentionListHandle, MentionListProps> | null = null;
            let popup: Instance[] = [];
            return {
              onStart: (props) => {
                component = new ReactRenderer(MentionList, {
                  props: {
                    items: props.items as SuggestionItem[],
                    command: async (item: SuggestionItem) => {
                      let id = item.id;
                      let label = item.fullName;
                      if (item.id === "__create__") {
                        const res = await createPerson({ data: { projectId, fullName: item.fullName } });
                        id = res.id;
                        label = res.fullName;
                      }
                      props.command({ id, label } as any);
                    },
                  },
                  editor: props.editor,
                });
                if (!props.clientRect) return;
                popup = tippy("body", {
                  getReferenceClientRect: props.clientRect as any,
                  appendTo: () => document.body,
                  content: component.element,
                  showOnCreate: true,
                  interactive: true,
                  trigger: "manual",
                  placement: "bottom-start",
                });
              },
              onUpdate(props) {
                component?.updateProps({
                  items: props.items as SuggestionItem[],
                  command: component?.props.command,
                } as any);
                if (popup[0] && props.clientRect) {
                  popup[0].setProps({ getReferenceClientRect: props.clientRect as any });
                }
              },
              onKeyDown(props) {
                if (props.event.key === "Escape") {
                  popup[0]?.hide();
                  return true;
                }
                return component?.ref?.onKeyDown(props) ?? false;
              },
              onExit() {
                popup[0]?.destroy();
                component?.destroy();
              },
            };
          },
        },
      }),
    ],
    content: markdownToDoc(initialMarkdown),
    editorProps: {
      attributes: {
        class: "tiptap-body",
      },
    },
    onUpdate: ({ editor }) => {
      const json = editor.getJSON();
      const md = docToMarkdown(json);
      onChange(md, json);
    },
    onBlur: () => onCommit(),
  });

  useEffect(() => {
    return () => editor?.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="mt-4">
      <style>{`
        .tiptap-body { min-height: 240px; outline: none; font-size: 15px; line-height: 1.6; color: var(--text); }
        .tiptap-body p { margin: 0 0 0.6em 0; }
        .tiptap-body h1 { font-size: 20px; font-weight: 500; margin: 0.4em 0 0.3em; color: var(--text); }
        .tiptap-body h2 { font-size: 17px; font-weight: 500; margin: 0.4em 0 0.3em; color: var(--text); }
        .tiptap-body h3 { font-size: 15px; font-weight: 500; margin: 0.4em 0 0.3em; color: var(--text); }
        .tiptap-body ul { padding-left: 1.25em; margin: 0.4em 0; list-style: disc; }
        .tiptap-body ol { padding-left: 1.25em; margin: 0.4em 0; list-style: decimal; }
        .tiptap-mention { background: var(--surface-raised); border-radius: 4px; padding: 0 4px; color: var(--text); }
        .tiptap-mention::before { content: "@"; }
        .tiptap-suggestion { background: var(--surface-raised); border: 1px solid var(--border); border-radius: 6px; padding: 4px 0; min-width: 200px; max-height: 240px; overflow-y: auto; }
        .tiptap-suggestion button { display: block; width: 100%; padding: 6px 12px; text-align: left; font-size: 13px; color: var(--text); background: transparent; border: 0; cursor: pointer; }
        .tiptap-suggestion button.is-selected, .tiptap-suggestion button:hover { background: var(--surface); }
      `}</style>
      <EditorContent editor={editor} />
    </div>
  );
}

type MentionListHandle = { onKeyDown: (p: { event: KeyboardEvent }) => boolean };
type MentionListProps = { items: SuggestionItem[]; command: (item: SuggestionItem) => void };

const MentionList = forwardRef<MentionListHandle, MentionListProps>(function MentionList(props, ref) {
  const [idx, setIdx] = useState(0);
  useEffect(() => setIdx(0), [props.items]);
  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }) => {
      if (event.key === "ArrowDown") {
        setIdx((i) => (i + 1) % Math.max(1, props.items.length));
        return true;
      }
      if (event.key === "ArrowUp") {
        setIdx((i) => (i - 1 + props.items.length) % Math.max(1, props.items.length));
        return true;
      }
      if (event.key === "Enter") {
        const it = props.items[idx];
        if (it) props.command(it);
        return true;
      }
      return false;
    },
  }));
  if (props.items.length === 0) return null;
  return (
    <div className="tiptap-suggestion">
      {props.items.map((it, i) => (
        <button
          key={`${it.id}-${i}`}
          className={i === idx ? "is-selected" : undefined}
          onClick={() => props.command(it)}
        >
          {it.fullName}
          {it.isNew && <span style={{ color: "var(--text-faint)" }}> · add new</span>}
        </button>
      ))}
    </div>
  );
});
