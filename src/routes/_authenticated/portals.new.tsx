import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { createPortal } from "@/lib/portals.functions";

export const Route = createFileRoute("/_authenticated/portals/new")({
  component: NewPortalPage,
});

function NewPortalPage() {
  const navigate = useNavigate();
  const create = useServerFn(createPortal);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await create({ data: { name: name.trim() } });
      navigate({ to: "/portals/$portalId", params: { portalId: res.id } });
    } catch (e: any) {
      setErr(e?.message ?? "Failed to create portal.");
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-[520px] px-6 py-12">
      <h1 className="text-[20px] font-medium" style={{ color: "var(--text)" }}>New portal</h1>
      <p className="mt-1 text-[13px]" style={{ color: "var(--text-muted)" }}>
        A portal is a shared intelligence workspace for one client. You'll be the owner.
      </p>
      <form onSubmit={submit} className="mt-6 space-y-4">
        <label className="block">
          <span className="text-[12px]" style={{ color: "var(--text-muted)" }}>Portal name</span>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 block w-full rounded px-3 py-2 text-[14px]"
            style={{ background: "var(--surface-raised)", border: "1px solid var(--border)", color: "var(--text)" }}
            placeholder="e.g. P150"
            maxLength={120}
          />
        </label>
        {err && <p className="text-[12px]" style={{ color: "var(--destructive)" }}>{err}</p>}
        <button
          type="submit"
          disabled={busy || !name.trim()}
          className="h-9 rounded-md px-4 text-[13px] font-medium"
          style={{ background: "var(--text)", color: "#000", opacity: busy || !name.trim() ? 0.4 : 1 }}
        >
          {busy ? "Creating…" : "Create portal"}
        </button>
      </form>
    </main>
  );
}
