
CREATE TABLE IF NOT EXISTS public.clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.clients TO authenticated;
GRANT ALL ON public.clients TO service_role;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "auth read clients" ON public.clients FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

INSERT INTO public.clients (name) VALUES ('P150'), ('Grantham Foundation'), ('TradesForce / IOF')
ON CONFLICT (name) DO NOTHING;
