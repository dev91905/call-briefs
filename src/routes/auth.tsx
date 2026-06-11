import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (data.user) throw redirect({ to: "/" });
  },
  component: AuthPage,
});

function AuthPage() {
  const router = useRouter();
  const [stage, setStage] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: true },
    });
    setLoading(false);
    if (error) { setError(error.message); return; }
    setStage("code");
  };

  const verifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const trimmedEmail = email.trim();
    const trimmedCode = code.trim();

    let verificationError: string | null = null;

    for (const type of ["email", "magiclink"] as const) {
      const { error } = await supabase.auth.verifyOtp({
        email: trimmedEmail,
        token: trimmedCode,
        type,
      });

      if (!error) {
        setLoading(false);
        router.navigate({ to: "/" });
        return;
      }

      verificationError = error.message;
    }

    setLoading(false);
    setError(verificationError ?? "Invalid code");
  };

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text)" }} className="flex items-center justify-center px-6">
      <div style={{ width: 360 }} className="flex flex-col">
        <div className="wordmark mb-10 text-center">Intelligence&nbsp;Portal</div>

        {stage === "email" ? (
          <form onSubmit={sendCode} className="space-y-3">
            <label className="block text-[12px]" style={{ color: "var(--text-muted)" }}>Your email</label>
            <input
              type="email"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@firm.com"
              className="block w-full rounded-md px-3 py-2.5 text-[14px] outline-none"
              style={{
                background: "var(--surface-raised)",
                border: "1px solid var(--border)",
                color: "var(--text)",
              }}
            />
            <button
              type="submit"
              disabled={loading || !email}
              className="block w-full rounded-md px-3 py-2.5 text-[14px] font-medium disabled:opacity-50"
              style={{ background: "var(--text)", color: "#000" }}
            >
              {loading ? "Sending…" : "Continue"}
            </button>
            {error && <p className="text-[12px]" style={{ color: "var(--destructive)" }}>{error}</p>}
          </form>
        ) : (
          <form onSubmit={verifyCode} className="space-y-3">
            <label className="block text-[12px]" style={{ color: "var(--text-muted)" }}>
              Enter the code sent to {email}
            </label>
            <input
              required
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 8))}
              inputMode="numeric"
              placeholder="12345678"
              className="block w-full rounded-md px-3 py-2.5 text-center text-[16px] tracking-[0.3em] outline-none tabular"
              style={{
                background: "var(--surface-raised)",
                border: "1px solid var(--border)",
                color: "var(--text)",
              }}
            />
            <button
              type="submit"
              disabled={loading || code.length < 8}
              className="block w-full rounded-md px-3 py-2.5 text-[14px] font-medium disabled:opacity-50"
              style={{ background: "var(--text)", color: "#000" }}
            >
              {loading ? "Verifying…" : "Continue"}
            </button>
            <button
              type="button"
              onClick={() => { setStage("email"); setCode(""); setError(null); }}
              className="block w-full text-center text-[12px]"
              style={{ color: "var(--text-faint)" }}
            >
              Use a different email
            </button>
            {error && <p className="text-[12px]" style={{ color: "var(--destructive)" }}>{error}</p>}
          </form>
        )}
      </div>
    </div>
  );
}
