import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type SessionInfo = {
  userId: string;
  email: string;
  role: "analyst" | "client" | "admin";
  isAdmin: boolean;
  clientId: string | null;
  clientName: string | null;
  fullName: string | null;
};

export const getSessionInfo = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId, claims } = context;

    const { data: profile } = await supabase
      .from("profiles")
      .select("email, full_name, is_admin, client_id")
      .eq("id", userId)
      .maybeSingle();

    let clientName: string | null = null;
    if (profile?.client_id) {
      const { data: client } = await supabase
        .from("clients")
        .select("name")
        .eq("id", profile.client_id)
        .maybeSingle();
      clientName = client?.name ?? null;
    }

    const { data: roleRows } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);

    const roles = (roleRows ?? []).map((r) => r.role as string);

    // Resolve highest privilege role for UI routing
    let role: "analyst" | "client" | "admin" = "client";
    if (roles.includes("analyst") || profile?.is_admin) role = "analyst";
    if (roles.includes("admin") || profile?.is_admin) role = roles.includes("analyst") || profile?.is_admin ? "analyst" : "admin";
    // If user has admin role but not analyst, they're an admin only.
    if (roles.includes("admin") && !roles.includes("analyst")) role = "admin";

    const result: SessionInfo = {
      userId,
      email: (claims.email as string) ?? profile?.email ?? "",
      role,
      isAdmin: !!profile?.is_admin || roles.includes("admin"),
      clientId: profile?.client_id ?? null,
      clientName,
      fullName: profile?.full_name ?? null,
    };
    return result;
  });
