import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  getGranolaStatus,
  saveGranolaKey,
  disconnectGranola,
  listGranolaFolders,
  listFolderMappings,
  addFolderMapping,
  removeFolderMapping,
} from "@/lib/granola.functions";
import { listClientsForSelect } from "@/lib/admin.functions";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const qc = useQueryClient();
  const status = useQuery({ queryKey: ["granola-status"], queryFn: () => getGranolaStatus() });
  const folders = useQuery({
    queryKey: ["granola-folders"],
    queryFn: () => listGranolaFolders(),
    enabled: status.data?.connected === true,
  });
  const mappings = useQuery({ queryKey: ["folder-mappings"], queryFn: () => listFolderMappings() });
  const clients = useQuery({ queryKey: ["clients-select"], queryFn: () => listClientsForSelect() });

  const save = useMutation({
    mutationFn: useServerFn(saveGranolaKey),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["granola-status"] }),
  });
  const disconnect = useMutation({
    mutationFn: useServerFn(disconnectGranola),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["granola-status"] }),
  });
  const addMap = useMutation({
    mutationFn: useServerFn(addFolderMapping),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["folder-mappings"] }),
  });
  const delMap = useMutation({
    mutationFn: useServerFn(removeFolderMapping),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["folder-mappings"] }),
  });

  const [key, setKey] = useState("");
  const [newFolderId, setNewFolderId] = useState("");
  const [newClientId, setNewClientId] = useState("");

  return (
    <main className="mx-auto max-w-[680px] px-6 py-10 space-y-10">
      <h1 className="text-[13px] font-medium" style={{ color: "var(--text-muted)" }}>Settings</h1>

      <section className="space-y-3">
        <h2 className="text-[14px] font-medium" style={{ color: "var(--text)" }}>Granola</h2>
        <p className="text-[12px]" style={{ color: "var(--text-faint)" }}>
          Create a key in Granola (Settings → API) — requires Granola Business — and paste it here. We store it server-side only.
        </p>
        {status.data?.connected ? (
          <div className="flex items-center justify-between rounded-md px-3 py-2" style={{ background: "var(--surface-raised)", border: "1px solid var(--border)" }}>
            <span className="text-[13px]" style={{ color: "var(--text)" }}>Connected ✓</span>
            <button
              onClick={() => disconnect.mutate({} as any)}
              className="text-[12px]"
              style={{ color: "var(--text-faint)" }}
            >
              Disconnect
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <input
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="Granola API key"
              className="block w-full rounded-md px-3 py-2 text-[13px] outline-none"
              style={{ background: "var(--surface-raised)", border: "1px solid var(--border)", color: "var(--text)" }}
            />
            <button
              disabled={!key || save.isPending}
              onClick={() => save.mutate({ data: { apiKey: key } }, { onSuccess: () => setKey("") })}
              className="h-9 rounded-md px-4 text-[13px] font-medium disabled:opacity-50"
              style={{ background: "var(--text)", color: "#000" }}
            >
              {save.isPending ? "Connecting…" : "Connect"}
            </button>
            {save.error && (
              <p className="text-[12px]" style={{ color: "var(--destructive)" }}>{(save.error as Error).message}</p>
            )}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-[14px] font-medium" style={{ color: "var(--text)" }}>Folder mappings</h2>
        <p className="text-[12px]" style={{ color: "var(--text-faint)" }}>
          Pair a Granola folder with a client. Calls filed in that folder become drafts for that client.
        </p>

        <div className="space-y-2">
          {(mappings.data ?? []).map((m) => (
            <div
              key={m.id}
              className="flex items-center justify-between rounded-md px-3 py-2 text-[13px]"
              style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
            >
              <span style={{ color: "var(--text)" }}>
                {m.folderName} <span style={{ color: "var(--text-faint)" }}>→</span> {m.clientName}
              </span>
              <button
                onClick={() => delMap.mutate({ data: { id: m.id } })}
                className="text-[12px]"
                style={{ color: "var(--text-faint)" }}
              >
                Remove
              </button>
            </div>
          ))}
        </div>

        {status.data?.connected && (
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={newFolderId}
              onChange={(e) => setNewFolderId(e.target.value)}
              className="rounded-md px-3 py-2 text-[13px]"
              style={{ background: "var(--surface-raised)", border: "1px solid var(--border)", color: "var(--text)" }}
            >
              <option value="">Granola folder…</option>
              {(folders.data?.folders ?? []).map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
            <span style={{ color: "var(--text-faint)" }}>→</span>
            <select
              value={newClientId}
              onChange={(e) => setNewClientId(e.target.value)}
              className="rounded-md px-3 py-2 text-[13px]"
              style={{ background: "var(--surface-raised)", border: "1px solid var(--border)", color: "var(--text)" }}
            >
              <option value="">Client…</option>
              {(clients.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <button
              disabled={!newFolderId || !newClientId}
              onClick={() => {
                const folder = (folders.data?.folders ?? []).find((f) => f.id === newFolderId);
                if (!folder) return;
                addMap.mutate(
                  { data: { granolaFolderId: folder.id, granolaFolderName: folder.name, clientId: newClientId } },
                  { onSuccess: () => { setNewFolderId(""); setNewClientId(""); } },
                );
              }}
              className="h-9 rounded-md px-3 text-[13px] disabled:opacity-50"
              style={{ background: "var(--text)", color: "#000" }}
            >
              Add
            </button>
            {folders.data?.error && (
              <p className="w-full text-[12px]" style={{ color: "var(--destructive)" }}>{folders.data.error}</p>
            )}
          </div>
        )}
      </section>
    </main>
  );
}
