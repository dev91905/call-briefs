import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { getPerson, addRelationship, removeRelationship, updatePerson } from "@/lib/people.functions";
import { getFormSchema } from "@/lib/schema.functions";

export const Route = createFileRoute("/_authenticated/portals/$portalId/people/$personId")({
  loader: ({ context, params }) =>
    Promise.all([
      context.queryClient.ensureQueryData({
        queryKey: ["person", params.portalId, params.personId],
        queryFn: () => getPerson({ data: { portalId: params.portalId, personId: params.personId } }),
      }),
      context.queryClient.ensureQueryData({
        queryKey: ["schema", params.portalId],
        queryFn: () => getFormSchema({ data: { portalId: params.portalId } }),
      }),
    ]),
  component: PersonPage,
});

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

function PersonPage() {
  const { portalId, personId } = Route.useParams();
  const qc = useQueryClient();
  const { data } = useSuspenseQuery({
    queryKey: ["person", portalId, personId],
    queryFn: () => getPerson({ data: { portalId, personId } }),
  });
  const { data: schema } = useSuspenseQuery({
    queryKey: ["schema", portalId],
    queryFn: () => getFormSchema({ data: { portalId } }),
  });

  const updateP = useServerFn(updatePerson);
  const addRel = useServerFn(addRelationship);
  const removeRel = useServerFn(removeRelationship);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ name: data.person.name, org: data.person.org ?? "", title: data.person.title ?? "", email: data.person.email ?? "", notes: data.person.notes ?? "" });

  const [relName, setRelName] = useState("");
  const [relType, setRelType] = useState(schema.relationshipTypes[0] ?? "knows");
  const [relNote, setRelNote] = useState("");

  async function saveProfile() {
    await updateP({ data: { portalId, personId, ...draft } });
    setEditing(false);
    qc.invalidateQueries({ queryKey: ["person", portalId, personId] });
    qc.invalidateQueries({ queryKey: ["people", portalId] });
  }

  async function addNewRel() {
    if (!relName.trim()) return;
    await addRel({ data: { portalId, fromPersonId: personId, toName: relName.trim(), type: relType, note: relNote || undefined } });
    setRelName(""); setRelNote("");
    qc.invalidateQueries({ queryKey: ["person", portalId, personId] });
    qc.invalidateQueries({ queryKey: ["people", portalId] });
  }

  async function delRel(id: string) {
    await removeRel({ data: { portalId, id } });
    qc.invalidateQueries({ queryKey: ["person", portalId, personId] });
  }

  return (
    <div className="grid gap-6 md:grid-cols-[1fr_320px]">
      <div className="space-y-4">
        <Link to="/portals/$portalId/people" params={{ portalId }} className="text-[12px]" style={{ color: "var(--text-faint)" }}>
          ← People
        </Link>
        {!editing ? (
          <div className="rounded-md p-4" style={{ border: "1px solid var(--border)" }}>
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-[18px] font-medium" style={{ color: "var(--text)" }}>{data.person.name}</h2>
                {data.person.title && <div className="text-[13px]" style={{ color: "var(--text-muted)" }}>{data.person.title}</div>}
                {data.person.org && <div className="text-[13px]" style={{ color: "var(--text-muted)" }}>{data.person.org}</div>}
                {data.person.email && <div className="text-[12px]" style={{ color: "var(--text-faint)" }}>{data.person.email}</div>}
              </div>
              <button onClick={() => setEditing(true)} className="text-[12px]" style={{ color: "var(--text-muted)" }}>Edit</button>
            </div>
            {data.person.notes && (
              <p className="mt-3 whitespace-pre-wrap text-[13px]" style={{ color: "var(--text-muted)" }}>{data.person.notes}</p>
            )}
          </div>
        ) : (
          <div className="rounded-md p-4 space-y-2" style={{ border: "1px solid var(--border)" }}>
            {(["name", "title", "org", "email"] as const).map((k) => (
              <input
                key={k}
                placeholder={k}
                value={(draft as any)[k]}
                onChange={(e) => setDraft({ ...draft, [k]: e.target.value })}
                className="w-full rounded px-2 py-1.5 text-[13px]"
                style={{ background: "var(--surface-raised)", border: "1px solid var(--border)", color: "var(--text)" }}
              />
            ))}
            <textarea
              placeholder="Notes"
              value={draft.notes}
              onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
              rows={4}
              className="w-full rounded px-2 py-1.5 text-[13px]"
              style={{ background: "var(--surface-raised)", border: "1px solid var(--border)", color: "var(--text)" }}
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setEditing(false)} className="h-8 rounded px-3 text-[12px]" style={{ color: "var(--text-muted)" }}>Cancel</button>
              <button onClick={saveProfile} className="h-8 rounded px-3 text-[12px] font-medium" style={{ background: "var(--text)", color: "#000" }}>Save</button>
            </div>
          </div>
        )}

        <div>
          <h3 className="text-[11px] uppercase tracking-wider" style={{ color: "var(--text-faint)" }}>Recent intelligence</h3>
          <ul className="mt-2 space-y-2">
            {data.entries.map((e: any) => (
              <li key={e.id} className="rounded-md p-3" style={{ border: "1px solid var(--border)" }}>
                <div className="text-[13px]" style={{ color: "var(--text)" }}>{e.subject?.name ?? data.person.name}</div>
                <p className="mt-1 whitespace-pre-wrap text-[12px]" style={{ color: "var(--text-muted)" }}>{extractText(e.readout).slice(0, 280)}</p>
              </li>
            ))}
            {data.entries.length === 0 && <p className="text-[12px]" style={{ color: "var(--text-faint)" }}>No entries yet.</p>}
          </ul>
        </div>
      </div>

      <aside className="space-y-4">
        <div>
          <h3 className="text-[11px] uppercase tracking-wider" style={{ color: "var(--text-faint)" }}>Connections</h3>
          <ul className="mt-2 space-y-1.5">
            {data.relationships.map((r: any) => {
              const other = r.from_person_id === personId ? r.to : r.from;
              const direction = r.from_person_id === personId ? "→" : "←";
              return (
                <li key={r.id} className="flex items-center gap-2 text-[12px]">
                  <span style={{ color: "var(--text-faint)" }}>{direction}</span>
                  <span style={{ color: "var(--text)" }}>{other?.name}</span>
                  <span style={{ color: "var(--text-faint)" }}>· {r.type}</span>
                  <button onClick={() => delRel(r.id)} className="ml-auto text-[11px]" style={{ color: "var(--text-faint)" }}>×</button>
                </li>
              );
            })}
            {data.relationships.length === 0 && <li className="text-[12px]" style={{ color: "var(--text-faint)" }}>No connections yet.</li>}
          </ul>
        </div>

        <div className="space-y-1.5">
          <input
            placeholder="Add connection (name)"
            value={relName}
            onChange={(e) => setRelName(e.target.value)}
            className="w-full rounded px-2 py-1.5 text-[12px]"
            style={{ background: "var(--surface-raised)", border: "1px solid var(--border)", color: "var(--text)" }}
          />
          <select
            value={relType}
            onChange={(e) => setRelType(e.target.value)}
            className="w-full rounded px-2 py-1.5 text-[12px]"
            style={{ background: "var(--surface-raised)", border: "1px solid var(--border)", color: "var(--text)" }}
          >
            {schema.relationshipTypes.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <input
            placeholder="Note (optional)"
            value={relNote}
            onChange={(e) => setRelNote(e.target.value)}
            className="w-full rounded px-2 py-1.5 text-[12px]"
            style={{ background: "var(--surface-raised)", border: "1px solid var(--border)", color: "var(--text)" }}
          />
          <button
            onClick={addNewRel}
            disabled={!relName.trim()}
            className="h-8 w-full rounded px-3 text-[12px] font-medium"
            style={{ background: "var(--text)", color: "#000", opacity: relName.trim() ? 1 : 0.4 }}
          >
            Add connection
          </button>
        </div>
      </aside>
    </div>
  );
}
