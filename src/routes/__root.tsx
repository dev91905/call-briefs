import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { supabase } from "../integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { getSessionInfo, type SessionInfo } from "../lib/session.functions";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4" style={{ background: "var(--bg)" }}>
      <div className="max-w-md text-center">
        <h1 className="text-6xl font-semibold" style={{ color: "var(--text)" }}>404</h1>
        <p className="mt-3 text-sm" style={{ color: "var(--text-muted)" }}>This page doesn't exist.</p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex h-9 items-center justify-center rounded-md px-4 text-sm font-medium"
            style={{ background: "var(--text)", color: "#000" }}
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center px-4" style={{ background: "var(--bg)" }}>
      <div className="max-w-md text-center">
        <h1 className="text-base font-semibold" style={{ color: "var(--text)" }}>This page didn't load.</h1>
        <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>Try again or head home.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => { router.invalidate(); reset(); }}
            className="inline-flex h-9 items-center justify-center rounded-md px-4 text-sm font-medium"
            style={{ background: "var(--text)", color: "#000" }}
          >
            Try again
          </button>
          <Link
            to="/"
            className="inline-flex h-9 items-center justify-center rounded-md px-4 text-sm"
            style={{ border: "1px solid var(--border)", color: "var(--text)" }}
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Intelligence Portal" },
      { name: "description", content: "Private client intelligence portal." },
      { name: "robots", content: "noindex, nofollow" },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body style={{ background: "#000" }}>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <AuthListener />
      <AppShell />
    </QueryClientProvider>
  );
}

function AuthListener() {
  const router = useRouter();
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
        router.invalidate();
      }
    });
    return () => subscription.unsubscribe();
  }, [router]);
  return null;
}

function AppShell() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const isAuthPage = path.startsWith("/auth");
  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text)" }}>
      {!isAuthPage && <TopBar />}
      <Outlet />
    </div>
  );
}

function useSession() {
  return useQuery<SessionInfo | null>({
    queryKey: ["session"],
    queryFn: async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) return null;
      return await getSessionInfo();
    },
    staleTime: 30_000,
  });
}

function TopBar() {
  const { data: session } = useSession();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);

  if (!session) return null;

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setMenuOpen(false);
    router.navigate({ to: "/auth" });
  };

  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: 50,
        background: "rgba(0,0,0,0.85)",
        backdropFilter: "saturate(180%) blur(8px)",
        borderBottom: "1px solid var(--border)",
      }}
    >
      <div className="mx-auto flex h-12 max-w-[1280px] items-center justify-between px-6">
        <Link to="/" className="wordmark">Intelligence&nbsp;Portal</Link>

        <div className="relative">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="text-[13px]"
            style={{ color: "var(--text-muted)" }}
          >
            {session.email}
          </button>
          {menuOpen && (
            <div
              className="absolute right-0 mt-2 w-48 rounded-md"
              style={{ background: "var(--surface-raised)", border: "1px solid var(--border)" }}
            >
              <Link
                to="/settings"
                onClick={() => setMenuOpen(false)}
                className="block w-full px-3 py-2 text-left text-[13px]"
                style={{ color: "var(--text)" }}
              >
                Account settings
              </Link>
              <button
                onClick={handleSignOut}
                className="block w-full px-3 py-2 text-left text-[13px]"
                style={{ color: "var(--text)" }}
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
