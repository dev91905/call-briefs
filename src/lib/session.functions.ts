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

    // Claim any pending invites matching this user's email
    const email = ((claims.email as string) ?? profile?.email ?? "").toLowerCase();
    if (email) {
      const { data: invites } = await supabase
        .from("pending_invites")
        .select("id, project_id, role")
        .ilike("email", email);
      if (invites && invites.length > 0) {
        for (const inv of invites) {
          await supabase
            .from("project_members")
            .upsert(
              { project_id: inv.project_id, user_id: userId, role: inv.role },
              { onConflict: "project_id,user_id" },
            );
          await supabase.from("pending_invites").delete().eq("id", inv.id);
        }
      }
    }

    const result: SessionInfo = {
      userId,
      email: (claims.email as string) ?? profile?.email ?? "",
      isAdmin: !!profile?.is_admin,
      fullName: profile?.full_name ?? null,
    };
    return result;
  });
