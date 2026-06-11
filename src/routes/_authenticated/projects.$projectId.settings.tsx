import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import {
  listMembers,
  inviteToProject,
  setMemberRole,
  removeMember,
  leaveProject,
  transferOwnership,
  renameProject,
  deleteProject,
  revokeInvite,
  getProject,
} from "@/lib/projects.functions";

export const Route = createFileRoute("/_authenticated/projects/$projectId/settings")({
  component: SettingsTab,
});

function SettingsTab() {
  const { projectId } = Route.useParams();
  const qc = useQueryClient();
  const router = useRouter();

  const project = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => getProject({ data: { id: projectId } }),
  });
  const members = useQuery({
    queryKey: ["project-members", projectId],
    queryFn: () => listMembers({ data: { projectId } }),
  });

  const myRole = project.data?.myRole ?? "member";
  const canManage = myRole === "owner" || myRole === "co_owner";
  const isOwner = myRole === "owner";

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["project-members", projectId] });
    qc.invalidateQueries({ queryKey: ["my-projects"] });
    qc.invalidateQueries({ queryKey: ["project", projectId] });
  };

  const invite = useMutation({ mutationFn: useServerFn(inviteToProject), onSuccess: invalidate });
  const updRole = useMutation({ mutationFn: useServerFn(setMemberRole), onSuccess: invalidate });
  const removeM = useMutation({ mutationFn: useServerFn(removeMember), onSuccess: invalidate });
  const leave = useMutation({
    mutationFn: useServerFn(leaveProject),
    onSuccess: () => { invalidate(); router.navigate({ to: "/" }); },
  });
  const transfer = useMutation({ mutationFn: useServerFn(transferOwnership), onSuccess: invalidate });
  const rename = useMutation({ mutationFn: useServerFn(renameProject), onSuccess: invalidate });
  const remove = useMutation({
    mutationFn: useServerFn(deleteProject),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["my-projects"] }); router.navigate({ to: "/" }); },
  });
  const revoke = useMutation({ mutationFn: useServerFn(revokeInvite), onSuccess: invalidate });

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"member" | "co_owner">("member");
  const [renameValue, setRenameValue] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState("");

  if (project.isLoading || members.isLoading) {
    return <p className="text-[13px]" style={{ color: "var(--text-faint)" }}>Loading…</p>;
  }

  return (
    <div className="space-y-10">
      <section>
        <h2 className="mb-3 text-[12px] font-medium uppercase tracking-wider" style={{ color: "var(--text-faint)" }}>
          Members
        </h2>
        <div className="space-y-1">
          {(members.data?.members ?? []).map((m) => (
            <div
              key={m.userId}
              className="flex items-center justify-between rounded-md px-3 py-2"
              style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
            >
              <div>
                <div className="text-[14px]" style={{ color: "var(--text)" }}>{m.fullName ?? m.email}</div>
                <div className="text-[11px]" style={{ color: "var(--text-faint)" }}>{m.email}</div>
              </div>
              <div className="flex items-center gap-2">
                {canManage && m.role !== "owner" ? (
                  <select
                    value={m.role}
                    onChange={(e) =>
                      updRole.mutate({
                        data: { projectId, userId: m.userId, role: e.target.value as "member" | "co_owner" },
                      })
                    }
                    className="rounded-md px-2 py-1 text-[12px]"
                    style={{ background: "var(--surface-raised)", border: "1px solid var(--border)", color: "var(--text)" }}
                  >
                    <option value="member">Member</option>
                    <option value="co_owner">Co-owner</option>
                  </select>
                ) : (
                  <span className="text-[11px] uppercase tracking-wider" style={{ color: "var(--text-faint)" }}>
                    {m.role === "owner" ? "Owner" : m.role === "co_owner" ? "Co-owner" : "Member"}
                  </span>
                )}
                {canManage && m.role !== "owner" && (
                  <button
                    onClick={() => removeM.mutate({ data: { projectId, userId: m.userId } })}
                    className="text-[12px]"
                    style={{ color: "var(--text-faint)" }}
                  >
                    Remove
                  </button>
                )}
                {isOwner && m.role !== "owner" && (
                  <button
                    onClick={() => {
                      if (confirm(`Transfer ownership to ${m.email}? You become co-owner.`)) {
                        transfer.mutate({ data: { projectId, newOwnerId: m.userId } });
                      }
                    }}
                    className="text-[12px]"
                    style={{ color: "var(--text-faint)" }}
                  >
                    Transfer ownership
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        {(members.data?.invites?.length ?? 0) > 0 && (
          <div className="mt-3 space-y-1">
            {(members.data?.invites ?? []).map((inv) => (
              <div
                key={inv.id}
                className="flex items-center justify-between rounded-md px-3 py-2"
                style={{ background: "var(--surface)", border: "1px dashed var(--border)" }}
              >
                <div className="text-[13px]" style={{ color: "var(--text-muted)" }}>
                  {inv.email} — pending invite ({inv.role})
                </div>
                {canManage && (
                  <button
                    onClick={() => revoke.mutate({ data: { projectId, inviteId: inv.id } })}
                    className="text-[12px]"
                    style={{ color: "var(--text-faint)" }}
                  >
                    Revoke
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {canManage && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!inviteEmail.trim()) return;
              invite.mutate(
                { data: { projectId, email: inviteEmail.trim(), role: inviteRole } },
                { onSuccess: () => setInviteEmail("") },
              );
            }}
            className="mt-4 flex flex-wrap items-center gap-2"
          >
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="email@example.com"
              className="flex-1 rounded-md px-3 py-2 text-[13px] outline-none min-w-[200px]"
              style={{ background: "var(--surface-raised)", border: "1px solid var(--border)", color: "var(--text)" }}
            />
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as "member" | "co_owner")}
              className="rounded-md px-2 py-2 text-[13px]"
              style={{ background: "var(--surface-raised)", border: "1px solid var(--border)", color: "var(--text)" }}
            >
              <option value="member">Member</option>
              <option value="co_owner">Co-owner</option>
            </select>
            <button
              type="submit"
              disabled={invite.isPending || !inviteEmail.trim()}
              className="h-9 rounded-md px-4 text-[13px] font-medium disabled:opacity-50"
              style={{ background: "var(--text)", color: "#000" }}
            >
              {invite.isPending ? "Inviting…" : "Invite"}
            </button>
            {invite.error && (
              <p className="basis-full text-[12px]" style={{ color: "var(--destructive)" }}>
                {(invite.error as Error).message}
              </p>
            )}
          </form>
        )}
      </section>

      {!isOwner && (
        <section>
          <button
            onClick={() => {
              if (confirm("Leave this project?")) leave.mutate({ data: { projectId } });
            }}
            className="text-[13px]"
            style={{ color: "var(--destructive)" }}
          >
            Leave project
          </button>
        </section>
      )}

      {isOwner && (
        <section>
          <h2 className="mb-3 text-[12px] font-medium uppercase tracking-wider" style={{ color: "var(--destructive)" }}>
            Danger zone
          </h2>
          <div className="space-y-4 rounded-xl p-5" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
            <div className="flex items-end gap-2">
              <label className="flex-1 text-[12px]" style={{ color: "var(--text-faint)" }}>
                Rename
                <input
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  placeholder={project.data?.name ?? ""}
                  className="mt-1 block w-full rounded-md px-3 py-2 text-[13px] outline-none"
                  style={{ background: "var(--surface-raised)", border: "1px solid var(--border)", color: "var(--text)" }}
                />
              </label>
              <button
                onClick={() => renameValue.trim() && rename.mutate({ data: { id: projectId, name: renameValue.trim() } })}
                disabled={!renameValue.trim() || rename.isPending}
                className="h-9 rounded-md px-4 text-[13px] disabled:opacity-50"
                style={{ background: "var(--surface-raised)", border: "1px solid var(--border)", color: "var(--text)" }}
              >
                Save
              </button>
            </div>
            <div className="flex items-end gap-2">
              <label className="flex-1 text-[12px]" style={{ color: "var(--text-faint)" }}>
                Delete project (type the project name to confirm)
                <input
                  value={deleteConfirm}
                  onChange={(e) => setDeleteConfirm(e.target.value)}
                  className="mt-1 block w-full rounded-md px-3 py-2 text-[13px] outline-none"
                  style={{ background: "var(--surface-raised)", border: "1px solid var(--border)", color: "var(--text)" }}
                />
              </label>
              <button
                onClick={() => remove.mutate({ data: { id: projectId } })}
                disabled={deleteConfirm !== project.data?.name || remove.isPending}
                className="h-9 rounded-md px-4 text-[13px] disabled:opacity-50"
                style={{ background: "var(--destructive)", color: "#fff" }}
              >
                Delete
              </button>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
