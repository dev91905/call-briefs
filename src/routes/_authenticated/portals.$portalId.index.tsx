import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { listPortalEntries, createEntry, deleteEntry, updateEntry, type EntryListItem } from "@/lib/entries.functions";
import { getFormSchema } from "@/lib/schema.functions";

export const Route = createFileRoute("/_authenticated/portals/$portalId/")({
  loader: ({ context, params }) =>
    Promise.all([
      context.queryClient.ensureQueryData({
        queryKey: ["entries", params.portalId],
        queryFn: () => listPortalEntries({ data: { portalId: params.portalId } }),
      }),
      context.queryClient.ensureQueryData({
        queryKey: ["schema", params.portalId],
        queryFn: () => getFormSchema({ data: { portalId: params.portalId } }),
      }),
    ]),
  component: FeedPage,
});

const parentApi = getRouteApi("/_authenticated/portals/$portalId");

function relTime(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function extractText(doc: any): string {
  if (!doc) return "";
  if (typeof doc === "string") return doc;
  if (Array.isArray(doc)) return doc.map(extractText).join(" ");
  if (typeof doc === "object") {
    if (typeof doc.text === "string") return doc.text;
    if (doc.content) return extractText(doc.content);
  }
  return "";
}

function FeedPage() {
  const { portalId } = parentApi.useParams();
  const qc = useQueryClient();
  const { data: entries } = useSuspenseQuery({
    queryKey: ["entries", portalId],
    queryFn: () => listPortalEntries({ data: { portalId } }),
  });
  const { data: schema } = useSuspenseQuery({
    queryKey: ["schema", portalId],
    queryFn: () => getFormSchema({ data: { portalId } }),
  });

  const create = useServerFn(createEntry);
  const del = useServerFn(deleteEntry);

  const [showForm, setShowForm] = useState(false);
  const [subject, setSubject] = useState("");
  const [talkedTo, setTalkedTo] = useState("");
  const [readout, setReadout] = useState("");
  const [mentions, setMentions] = useState("");
  const [callDate, setCallDate] = useState("");
  const [custom, setCustom] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);

  function reset() {
    setSubject(""); setTalkedTo(""); setReadout(""); setMentions(""); setCallDate(""); setCustom({});
  }

  async function save() {
    if (!subject.trim()) return;
    setSaving(true);
    try {
      await create({
        data: {
          portalId,
          subjectName: subject,
          talkedTo: talkedTo || undefined,
          readout: readout ? { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: readout }] }] } : null,
          callDate: callDate || null,
          custom,
          mentionNames: mentions.split(",").map((s) => s.trim()).filter(Boolean),
        },
      });
      reset();
      setShowForm(false);
      qc.invalidateQueries({ queryKey: ["entries", portalId] });
      qc.invalidateQueries({ queryKey: ["activity"] });
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this entry?")) return;
    await del({ data: { portalId, id } });
    qc.invalidateQueries({ queryKey: ["entries", portalId] });
  }

  return (
    <div className="space-y-4">
      {!showForm && (
        <button
          onClick={() => setShowForm(true)}
          className="w-full rounded-md px-4 py-3 text-left text-[13px]"
          style={{ border: "1px dashed var(--border)", color: "var(--text-muted)" }}
        >
          + New intelligence entry
        </button>
      )}

      {showForm && (
        <div className="space-y-3 rounded-md p-4" style={{ border: "1px solid var(--border)", background: "var(--surface)" }}>
          <input
            autoFocus
            placeholder="Subject (person)"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="w-full bg-transparent text-[16px] font-medium outline-none"
            style={{ color: "var(--text)" }}
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              placeholder="Talked to"
              value={talkedTo}
              onChange={(e) => setTalkedTo(e.target.value)}
              className="rounded px-2 py-1.5 text-[13px]"
              style={{ background: "var(--surface-raised)", border: "1px solid var(--border)", color: "var(--text)" }}
            />
            <input
              type="date"
              value={callDate}
              onChange={(e) => setCallDate(e.target.value)}
              className="rounded px-2 py-1.5 text-[13px]"
              style={{ background: "var(--surface-raised)", border: "1px solid var(--border)", color: "var(--text)" }}
            />
          </div>
          <textarea
            placeholder="Readout"
            value={readout}
            onChange={(e) => setReadout(e.target.value)}
            rows={6}
            className="w-full rounded px-3 py-2 text-[13px]"
            style={{ background: "var(--surface-raised)", border: "1px solid var(--border)", color: "var(--text)" }}
          />
          <input
            placeholder="Mentions (comma-separated names)"
            value={mentions}
            onChange={(e) => setMentions(e.target.value)}
            className="w-full rounded px-2 py-1.5 text-[13px]"
            style={{ background: "var(--surface-raised)", border: "1px solid var(--border)", color: "var(--text)" }}
          />
          {schema.fields.map((f: any) => (
            <CustomFieldInput key={f.key} field={f} value={custom[f.key]} onChange={(v) => setCustom({ ...custom, [f.key]: v })} />
          ))}
          <div className="flex justify-end gap-2 pt-1">
            <button
              onClick={() => { setShowForm(false); reset(); }}
              className="h-8 rounded px-3 text-[12px]"
              style={{ color: "var(--text-muted)" }}
            >
              Cancel
            </button>
            <button
              onClick={save}
              disabled={saving || !subject.trim()}
              className="h-8 rounded px-3 text-[12px] font-medium"
              style={{ background: "var(--text)", color: "#000", opacity: saving || !subject.trim() ? 0.4 : 1 }}
            >
              {saving ? "Saving…" : "Save entry"}
            </button>
          </div>
        </div>
      )}

      {entries.length === 0 && !showForm && (
        <p className="text-[12px]" style={{ color: "var(--text-faint)" }}>No intelligence yet.</p>
      )}

      <ul className="space-y-2">
        {entries.map((e: EntryListItem) => (
          <li key={e.id} className="rounded-md p-4" style={{ border: "1px solid var(--border)" }}>
            <div className="flex items-center justify-between">
              <div className="text-[15px] font-medium" style={{ color: "var(--text)" }}>{e.subjectName ?? "(no subject)"}</div>
              <button
                onClick={() => remove(e.id)}
                className="text-[11px]"
                style={{ color: "var(--text-faint)" }}
              >
                Delete
              </button>
            </div>
            <div className="mt-0.5 text-[11px]" style={{ color: "var(--text-faint)" }}>
              {e.authorEmail} · {relTime(e.createdAt)} {e.callDate && `· call ${e.callDate}`}
              {e.talkedTo && ` · with ${e.talkedTo}`}
            </div>
            {extractText(e.readout) && (
              <p className="mt-2 whitespace-pre-wrap text-[13px]" style={{ color: "var(--text-muted)" }}>
                {extractText(e.readout)}
              </p>
            )}
            {e.mentions.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {e.mentions.map((m) => (
                  <span key={m.id} className="rounded px-1.5 py-0.5 text-[11px]"
                    style={{ background: "var(--surface-raised)", color: "var(--text-muted)" }}>
                    {m.name}
                  </span>
                ))}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function CustomFieldInput({ field, value, onChange }: { field: any; value: any; onChange: (v: any) => void }) {
  const common = {
    className: "w-full rounded px-2 py-1.5 text-[13px]",
    style: { background: "var(--surface-raised)", border: "1px solid var(--border)", color: "var(--text)" },
  };
  if (field.type === "longtext") {
    return (
      <label className="block">
        <span className="text-[11px]" style={{ color: "var(--text-faint)" }}>{field.label}</span>
        <textarea {...common} rows={3} value={value ?? ""} onChange={(e) => onChange(e.target.value)} />
      </label>
    );
  }
  if (field.type === "select") {
    return (
      <label className="block">
        <span className="text-[11px]" style={{ color: "var(--text-faint)" }}>{field.label}</span>
        <select {...common} value={value ?? ""} onChange={(e) => onChange(e.target.value)}>
          <option value="">—</option>
          {(field.options ?? []).map((o: string) => <option key={o} value={o}>{o}</option>)}
        </select>
      </label>
    );
  }
  return (
    <label className="block">
      <span className="text-[11px]" style={{ color: "var(--text-faint)" }}>{field.label}</span>
      <input
        {...common}
        type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
