import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type CustomField = {
  key: string;
  label: string;
  type: "text" | "longtext" | "select" | "multiselect" | "date" | "number";
  required?: boolean;
  options?: string[];
};

async function assertAdmin(supabase: any, userId: string, portalId: string) {
  const { data } = await supabase.rpc("is_portal_admin", { _user: userId, _portal: portalId });
  if (!data) throw new Error("Forbidden");
}

export const getFormSchema = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ portalId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: row } = await context.supabase
      .from("portal_form_schema")
      .select("fields, relationship_types")
      .eq("portal_id", data.portalId)
      .maybeSingle();
    return {
      fields: ((row?.fields as any) ?? []) as CustomField[],
      relationshipTypes:
        ((row?.relationship_types as any) ?? [
          "knows",
          "works with",
          "reports to",
          "donor to",
          "family",
          "mentor",
          "introduced by",
        ]) as string[],
    };
  });

export const updateFormSchema = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        portalId: z.string().uuid(),
        fields: z.array(z.any()),
        relationshipTypes: z.array(z.string().min(1).max(60)).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId, data.portalId);
    const patch: any = { fields: data.fields, updated_by: context.userId, updated_at: new Date().toISOString() };
    if (data.relationshipTypes) patch.relationship_types = data.relationshipTypes;
    const { error } = await context.supabase
      .from("portal_form_schema")
      .upsert({ portal_id: data.portalId, ...patch }, { onConflict: "portal_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
