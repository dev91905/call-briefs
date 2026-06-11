import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  return (
    <main className="mx-auto max-w-[680px] px-6 py-10 space-y-6">
      <h1 className="text-[13px] font-medium" style={{ color: "var(--text-muted)" }}>Settings</h1>
      <p className="text-[13px]" style={{ color: "var(--text-faint)" }}>
        Briefs are composed manually in the Queue. No integrations to configure.
      </p>
    </main>
  );
}
