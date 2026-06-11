import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { createProject } from "@/lib/projects.functions";

export const Route = createFileRoute("/_authenticated/projects/new")({
  component: NewProjectPage,
});

function NewProjectPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const create = useMutation({
    mutationFn: useServerFn(createProject),
    onSuccess: (res: { id: string }) => {
      router.navigate({ to: "/projects/$projectId", params: { projectId: res.id } });
    },
  });

  return (
    <main className="mx-auto max-w-[480px] px-6 py-16">
      <h1 className="mb-6 text-[20px] font-medium" style={{ color: "var(--text)" }}>
        Start a new project
      </h1>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          create.mutate({ data: { name: name.trim() } });
        }}
        className="space-y-4"
      >
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Project name"
          className="block w-full rounded-md px-3 py-2 text-[15px] outline-none"
          style={{
            background: "var(--surface-raised)",
            border: "1px solid var(--border)",
            color: "var(--text)",
          }}
        />
        <button
          type="submit"
          disabled={!name.trim() || create.isPending}
          className="h-10 rounded-md px-5 text-[13px] font-medium disabled:opacity-50"
          style={{ background: "var(--text)", color: "#000" }}
        >
          {create.isPending ? "Creating…" : "Create project"}
        </button>
        {create.error && (
          <p className="text-[12px]" style={{ color: "var(--destructive)" }}>
            {(create.error as Error).message}
          </p>
        )}
      </form>
    </main>
  );
}
