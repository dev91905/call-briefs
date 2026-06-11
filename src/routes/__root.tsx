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
import { listOpenRequests } from "../lib/requests.functions";

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
      {!isAuthPage && <BottomBar />}
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

function useOpenRequestCount(enabled: boolean) {
  return useQuery({
    queryKey: ["open-request-count"],
    enabled,
    queryFn: async () => {
      const list = await listOpenRequests();
      return list.filter((r) => r.status === "open").length;
    },
    refetchInterval: 60_000,
  });
}

function TopBar() {
  const { data: session } = useSession();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const isAnalyst = session?.role === "analyst" || session?.role === "admin";
  const openCount = useOpenRequestCount(!!session && isAnalyst).data ?? 0;

  if (!session) return null;

  const tabs = isAnalyst
    ? [
        { to: "/", label: "Queue" },
        { to: "/requests", label: "Requests", badge: openCount > 0 },
        { to: "/published", label: "Published" },
        ...(session.isAdmin ? [{ to: "/clients", label: "Clients" }] : []),
        { to: "/settings", label: "Settings" },
      ]
    : [{ to: "/", label: "Briefs" }];

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
      <div className="mx-auto flex h-12 max-w-[1100px] items-center justify-between px-6">
        <Link to="/" className="wordmark">Intelligence&nbsp;Portal</Link>

        <nav className="hidden items-center gap-6 md:flex">
          {tabs.map((t) => {
            const active = t.to === "/" ? path === "/" : path.startsWith(t.to);
            return (
              <Link
                key={t.to}
                to={t.to}
                className="relative text-[13px] font-medium"
                style={{
                  color: active ? "var(--text)" : "var(--text-faint)",
                  paddingBottom: 14,
                  marginTop: 14,
                  borderBottom: active ? "1px solid #fff" : "1px solid transparent",
                }}
              >
                {t.label}
                {t.badge ? (
                  <span
                    className="dot dot-destructive"
                    style={{ position: "absolute", top: 2, right: -10 }}
                  />
                ) : null}
              </Link>
            );
          })}
        </nav>

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

function BottomBar() {
  const { data: session } = useSession();
  const path = useRouterState({ select: (s) => s.location.pathname });
  if (!session) return null;
  const isAnalyst = session.role === "analyst" || session.role === "admin";
  if (!isAnalyst) return null;
  const openCount = useOpenRequestCount(true).data ?? 0;

  const tabs = [
    { to: "/", label: "Queue" },
    { to: "/requests", label: "Requests", badge: openCount > 0 },
    { to: "/published", label: "Published" },
    { to: "/settings", label: "Settings" },
  ];

  return (
    <nav
      className="md:hidden"
      style={{
        position: "sticky",
        bottom: 0,
        background: "rgba(0,0,0,0.9)",
        borderTop: "1px solid var(--border)",
        backdropFilter: "blur(8px)",
      }}
    >
      <div className="flex h-14 items-center justify-around px-2">
        {tabs.map((t) => {
          const active = t.to === "/" ? path === "/" : path.startsWith(t.to);
          return (
            <Link
              key={t.to}
              to={t.to}
              className="relative flex flex-col items-center justify-center text-[11px]"
              style={{ color: active ? "var(--text)" : "var(--text-faint)" }}
            >
              {t.label}
              {t.badge && (
                <span className="dot dot-destructive" style={{ position: "absolute", top: 4, right: -8 }} />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
