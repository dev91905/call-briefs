
-- Add explicit deny policy on granola_connections (no authenticated/anon access)
CREATE POLICY "granola_connections: no public access" ON public.granola_connections
  FOR ALL TO authenticated USING (false) WITH CHECK (false);

-- Lock down touch_updated_at search_path
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Revoke EXECUTE on SECURITY DEFINER trigger function from public/authenticated
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
-- has_role must remain executable by authenticated users (used in policies)
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;
