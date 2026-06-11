import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  listClientsAdmin,
  createClientAdmin,
  renameClient,
  inviteUser,
} from "@/lib/admin.functions";

export const Route = createFileRoute("/_authenticated/clients")({
  component: ClientsAdminPage,
});

function ClientsAdminPage() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["clients-admin"],
    queryFn: () => listClientsAdmin(),
    retry: false,
  });
  const create = useMutation({
    mutationFn: useServerFn(createClientAdmin),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["clients-admin"] }),
  });
  const rename = useMutation({
    mutationFn: useServerFn(renameClient),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["clients-admin"] }),
  });
  const invite = useMutation({
    mutationFn: useServerFn(inviteUser),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["clients-admin"] }),
  });

  const [newClientName, setNewClientName] = useState("");

  if (isLoading) return <div className="p-12 text-center" style={{ color: "var(--text-faint)" }}>Loading…</div>;
  if (error) return <div className="p-12 text-center" style={{ color: "var(--destructive)" }}>{(error as Error).message}</div>;

  return (
    <main className="mx-auto max-w-[880px] px-6 py-10 space-y-8">
      <h1 className="text-[13px] font-medium" style={{ color: "var(--text-muted)" }}>Clients</h1>

      <div className="flex items-center gap-2">
        <input
          value={newClientName}
          onChange={(e) => setNewClientName(e.target.value)}
          placeholder="New client name"
          className="rounded-md px-3 py-2 text-[13px]"
          style={{ background: "var(--surface-raised)", border: "1px solid var(--border)", color: "var(--text)" }}
        />
        <button
          disabled={!newClientName || create.isPending}
          onClick={() => create.mutate({ data: { name: newClientName } }, { onSuccess: () => setNewClientName("") })}
          className="h-9 rounded-md px-3 text-[13px] disabled:opacity-50"
          style={{ background: "var(--text)", color: "#000" }}
        >
          Add client
        </button>
      </div>

      <div className="space-y-4">
        {(data ?? []).map((c) => (
          <ClientRow key={c.id} client={c} onRename={(name) => rename.mutate({ data: { id: c.id, name } })} onInvite={(email) => invite.mutate({ data: { email, role: "client", clientId: c.id } })} />
        ))}
      </div>

      <section className="pt-4" style={{ borderTop: "1px solid var(--border)" }}>
        <h2 className="mb-3 mt-6 text-[13px] font-medium" style={{ color: "var(--text-muted)" }}>Invite analyst</h2>
        <InviteAnalyst onInvite={(email) => invite.mutate({ data: { email, role: "analyst" } })} />
      </section>
    </main>
  );
}

function ClientRow({
  client,
  onRename,
  onInvite,
}: {
  client: {
    id: string;
    name: string;
    clientUsers: { id: string; email: string; fullName: string | null }[];
    analystEmails: string[];
  };
  onRename: (name: string) => void;
  onInvite: (email: string) => void;
}) {
  const [name, setName] = useState(client.name);
  const [email, setEmail] = useState("");

  return (
    <div
      className="rounded-xl p-5"
      style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
    >
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => { if (name && name !== client.name) onRename(name); }}
        className="mb-3 block w-full bg-transparent text-[16px] font-semibold outline-none"
        style={{ color: "var(--text)" }}
      />

      <div className="mb-3">
        <div className="mb-1 text-[11px] uppercase tracking-wider" style={{ color: "var(--text-faint)" }}>Client users</div>
        {client.clientUsers.length === 0 && <p className="text-[12px]" style={{ color: "var(--text-faint)" }}>None yet.</p>}
        <ul className="space-y-1">
          {client.clientUsers.map((u) => (
            <li key={u.id} className="text-[13px]" style={{ color: "var(--text)" }}>{u.email}</li>
          ))}
        </ul>
        <div className="mt-2 flex gap-2">
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="invite by email"
            className="flex-1 rounded-md px-3 py-1.5 text-[13px]"
            style={{ background: "var(--surface-raised)", border: "1px solid var(--border)", color: "var(--text)" }}
          />
          <button
            disabled={!email}
            onClick={() => { onInvite(email); setEmail(""); }}
            className="h-8 rounded-md px-3 text-[12px]"
            style={{ background: "var(--text)", color: "#000" }}
          >
            Invite
          </button>
        </div>
      </div>

      <div>
        <div className="mb-1 text-[11px] uppercase tracking-wider" style={{ color: "var(--text-faint)" }}>Analysts mapped</div>
        {client.analystEmails.length === 0 ? (
          <p className="text-[12px]" style={{ color: "var(--text-faint)" }}>No mappings yet.</p>
        ) : (
          <ul className="space-y-1">
            {client.analystEmails.map((e) => (
              <li key={e} className="text-[13px]" style={{ color: "var(--text-muted)" }}>{e}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function InviteAnalyst({ onInvite }: { onInvite: (email: string) => void }) {
  const [email, setEmail] = useState("");
  return (
    <div className="flex gap-2">
      <input
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="analyst@firm.com"
        className="flex-1 rounded-md px-3 py-2 text-[13px]"
        style={{ background: "var(--surface-raised)", border: "1px solid var(--border)", color: "var(--text)" }}
      />
      <button
        disabled={!email}
        onClick={() => { onInvite(email); setEmail(""); }}
        className="h-9 rounded-md px-3 text-[13px]"
        style={{ background: "var(--text)", color: "#000" }}
      >
        Invite
      </button>
    </div>
  );
}
