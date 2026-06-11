import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { listMembers, inviteMember, setMemberRole, removeMember, renamePortal, getPortal } from "@/lib/portals.functions";
import { getFormSchema, updateFormSchema, type CustomField } from "@/lib/schema.functions";

export const Route = createFileRoute("/_authenticated/portals/$portalId/settings")({
  loader: ({ context, params }) =>
    Promise.all([
      context.queryClient.ensureQueryData({
        queryKey: ["members", params.portalId],
        queryFn: () => listMembers({ data: { portalId: params.portalId } }),
      }),
      context.queryClient.ensureQueryData({
        queryKey: ["schema", params.portalId],
        queryFn: () => getFormSchema({ data: { portalId: params.portalId } }),
      }),
    ]),
  component: SettingsPage,
});

const parentApi = getRouteApi("/_authenticated/portals/$portalId");

function SettingsPage() {
  const { portalId } = parentApi.useParams();
  const qc = useQueryClient();
  const { data: portal } = useSuspenseQuery({
    queryKey: ["portal", portalId],
    queryFn: () => getPortal({ data: { portalId } }),
  });
  const { data: members } = useSuspenseQuery({
    queryKey: ["members", portalId],
    queryFn: () => listMembers({ data: { portalId } }),
  });
  const { data: schema } = useSuspenseQuery({
    queryKey: ["schema", portalId],
    queryFn: () => getFormSchema({ data: { portalId } }),
  });

  const canAdmin = portal.myRole === "owner" || portal.myRole === "co_owner";

  const invite = useServerFn(inviteMember);
  const setRole = useServerFn(setMemberRole);
  const remove = useServerFn(removeMember);
  const rename = useServerFn(renamePortal);
  const updateSchema = useServerFn(updateFormSchema);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"analyst" | "co_owner">("analyst");
  const [portalName, setPortalName] = useState(portal.name);
  const [fields, setFields] = useState<CustomField[]>(schema.fields);
  const [relTypes, setRelTypes] = useState<string[]>(schema.relationshipTypes);

  async function doInvite() {
    if (!inviteEmail.trim()) return;
    await invite({ data: { portalId, email: inviteEmail.trim(), role: inviteRole } });
    setInviteEmail("");
    qc.invalidateQueries({ queryKey: ["members", portalId] });
  }

  async function doSetRole(userId: string, role: "owner" | "co_owner" | "analyst") {
    await setRole({ data: { portalId, userId, role } });
    qc.invalidateQueries({ queryKey: ["members", portalId] });
    qc.invalidateQueries({ queryKey: ["portal", portalId] });
  }

  async function doRemove(userId: string) {
    if (!confirm("Remove this member?")) return;
    await remove({ data: { portalId, userId } });
    qc.invalidateQueries({ queryKey: ["members", portalId] });
  }

  async function doRename() {
    if (!portalName.trim() || portalName === portal.name) return;
    await rename({ data: { portalId, name: portalName.trim() } });
    qc.invalidateQueries({ queryKey: ["portal", portalId] });
    qc.invalidateQueries({ queryKey: ["my-portals"] });
  }

  async function saveSchema() {
    await updateSchema({ data: { portalId, fields, relationshipTypes: relTypes } });
    qc.invalidateQueries({ queryKey: ["schema", portalId] });
  }

  function addField() {
    setFields([
      ...fields,
      { key: `f_${Math.random().toString(36).slice(2, 8)}`, label: "New field", type: "text" },
    ]);
  }

  return (
    <div className="max-w-[680px] space-y-8">
      <section>
        <h2 className="text-[11px] uppercase tracking-wider" style={{ color: "var(--text-faint)" }}>Portal</h2>
        <div className="mt-2 flex gap-2">
          <input
            value={portalName}
            disabled={!canAdmin}
            onChange={(e) => setPortalName(e.target.value)}
            className="flex-1 rounded px-2 py-1.5 text-[13px]"
            style={{ background: "var(--surface-raised)", border: "1px solid var(--border)", color: "var(--text)" }}
          />
          {canAdmin && (
            <button onClick={doRename} className="h-8 rounded px-3 text-[12px]" style={{ background: "var(--text)", color: "#000" }}>
              Rename
            </button>
          )}
        </div>
      </section>

      <section>
        <h2 className="text-[11px] uppercase tracking-wider" style={{ color: "var(--text-faint)" }}>Members</h2>
        <ul className="mt-2 space-y-1.5">
          {members.map((m: any) => (
            <li key={m.userId} className="flex items-center gap-2 rounded px-3 py-2" style={{ border: "1px solid var(--border)" }}>
              <div className="flex-1">
                <div className="text-[13px]" style={{ color: "var(--text)" }}>{m.email}</div>
                {m.fullName && <div className="text-[11px]" style={{ color: "var(--text-faint)" }}>{m.fullName}</div>}
              </div>
              {canAdmin ? (
                <select
                  value={m.role}
                  onChange={(e) => doSetRole(m.userId, e.target.value as any)}
                  className="rounded px-2 py-1 text-[12px]"
                  style={{ background: "var(--surface-raised)", border: "1px solid var(--border)", color: "var(--text)" }}
                >
                  <option value="owner">owner</option>
                  <option value="co_owner">co-owner</option>
                  <option value="analyst">analyst</option>
                </select>
              ) : (
                <span className="text-[11px]" style={{ color: "var(--text-faint)" }}>{m.role}</span>
              )}
              {canAdmin && m.role !== "owner" && (
                <button onClick={() => doRemove(m.userId)} className="text-[11px]" style={{ color: "var(--text-faint)" }}>Remove</button>
              )}
            </li>
          ))}
        </ul>
        {canAdmin && (
          <div className="mt-3 flex gap-2">
            <input
              placeholder="email@example.com"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              className="flex-1 rounded px-2 py-1.5 text-[13px]"
              style={{ background: "var(--surface-raised)", border: "1px solid var(--border)", color: "var(--text)" }}
            />
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as any)}
              className="rounded px-2 py-1 text-[12px]"
              style={{ background: "var(--surface-raised)", border: "1px solid var(--border)", color: "var(--text)" }}
            >
              <option value="analyst">analyst</option>
              <option value="co_owner">co-owner</option>
            </select>
            <button onClick={doInvite} className="h-8 rounded px-3 text-[12px]" style={{ background: "var(--text)", color: "#000" }}>
              Invite
            </button>
          </div>
        )}
      </section>

      <section>
        <h2 className="text-[11px] uppercase tracking-wider" style={{ color: "var(--text-faint)" }}>Entry form — custom fields</h2>
        <ul className="mt-2 space-y-2">
          {fields.map((f, i) => (
            <li key={f.key} className="grid grid-cols-[1fr_120px_24px] gap-2">
              <input
                value={f.label}
                disabled={!canAdmin}
                onChange={(e) => setFields(fields.map((x, j) => j === i ? { ...x, label: e.target.value } : x))}
                className="rounded px-2 py-1.5 text-[13px]"
                style={{ background: "var(--surface-raised)", border: "1px solid var(--border)", color: "var(--text)" }}
              />
              <select
                value={f.type}
                disabled={!canAdmin}
                onChange={(e) => setFields(fields.map((x, j) => j === i ? { ...x, type: e.target.value as any } : x))}
                className="rounded px-2 py-1 text-[12px]"
                style={{ background: "var(--surface-raised)", border: "1px solid var(--border)", color: "var(--text)" }}
              >
                <option value="text">text</option>
                <option value="longtext">long text</option>
                <option value="select">select</option>
                <option value="date">date</option>
                <option value="number">number</option>
              </select>
              {canAdmin && (
                <button onClick={() => setFields(fields.filter((_, j) => j !== i))} className="text-[14px]" style={{ color: "var(--text-faint)" }}>×</button>
              )}
            </li>
          ))}
        </ul>
        {canAdmin && (
          <div className="mt-3 flex gap-2">
            <button onClick={addField} className="h-8 rounded px-3 text-[12px]" style={{ border: "1px solid var(--border)", color: "var(--text)" }}>+ Add field</button>
            <button onClick={saveSchema} className="h-8 rounded px-3 text-[12px]" style={{ background: "var(--text)", color: "#000" }}>Save form</button>
          </div>
        )}
      </section>

      <section>
        <h2 className="text-[11px] uppercase tracking-wider" style={{ color: "var(--text-faint)" }}>Relationship types</h2>
        <textarea
          value={relTypes.join("\n")}
          disabled={!canAdmin}
          onChange={(e) => setRelTypes(e.target.value.split("\n").map((s) => s.trim()).filter(Boolean))}
          rows={4}
          className="mt-2 w-full rounded px-2 py-1.5 text-[13px]"
          style={{ background: "var(--surface-raised)", border: "1px solid var(--border)", color: "var(--text)" }}
        />
        {canAdmin && (
          <button onClick={saveSchema} className="mt-2 h-8 rounded px-3 text-[12px]" style={{ background: "var(--text)", color: "#000" }}>Save</button>
        )}
      </section>
    </div>
  );
}
