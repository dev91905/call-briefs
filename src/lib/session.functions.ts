import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type SessionInfo = {
  userId: string;
  email: string;
  isAdmin: boolean;
  fullName: string | null;
};

export const getSessionInfo = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId, claims } = context;

    const { data: profile } = await supabase
      .from("profiles")
      .select("email, full_name, is_admin")
      .eq("id", userId)
      .maybeSingle();

    const result: SessionInfo = {
      userId,
      email: (claims.email as string) ?? profile?.email ?? "",
      isAdmin: !!profile?.is_admin,
      fullName: profile?.full_name ?? null,
    };
    return result;
  });
