
-- Enums
CREATE TYPE public.app_role AS ENUM ('analyst', 'client', 'admin');
CREATE TYPE public.brief_status AS ENUM ('pending', 'published', 'rejected', 'skipped');
CREATE TYPE public.request_status AS ENUM ('open', 'resolved');

-- Clients
CREATE TABLE public.clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.clients TO authenticated;
GRANT ALL ON public.clients TO service_role;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

INSERT INTO public.clients (name) VALUES ('P150'), ('Grantham Foundation'), ('TradesForce / IOF');

-- Profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  is_admin BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- User roles (separate table — security)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

-- Profiles policies
CREATE POLICY "Profiles: self read" ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'analyst'));
CREATE POLICY "Profiles: self update" ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- user_roles policies
CREATE POLICY "Roles: self read" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- Clients policies
CREATE POLICY "Clients: authenticated read" ON public.clients FOR SELECT TO authenticated USING (true);

-- Granola connections (server-only — no grants to authenticated)
CREATE TABLE public.granola_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  analyst_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  api_key TEXT NOT NULL,
  last_polled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.granola_connections TO service_role;
ALTER TABLE public.granola_connections ENABLE ROW LEVEL SECURITY;
-- No policies = no access for any non-service role.

-- Folder mappings
CREATE TABLE public.folder_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  analyst_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  granola_folder_id TEXT NOT NULL,
  granola_folder_name TEXT NOT NULL,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (analyst_id, granola_folder_id, client_id)
);
GRANT SELECT, INSERT, DELETE ON public.folder_mappings TO authenticated;
GRANT ALL ON public.folder_mappings TO service_role;
ALTER TABLE public.folder_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Mappings: analyst owns" ON public.folder_mappings FOR ALL TO authenticated
  USING (analyst_id = auth.uid()) WITH CHECK (analyst_id = auth.uid());

-- Briefs
CREATE TABLE public.briefs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  analyst_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  granola_note_id TEXT NOT NULL,
  call_title TEXT NOT NULL,
  call_date DATE,
  participants TEXT,
  body TEXT NOT NULL DEFAULT '',
  status public.brief_status NOT NULL DEFAULT 'pending',
  skip_reason TEXT,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (granola_note_id, client_id)
);
GRANT SELECT, INSERT, UPDATE ON public.briefs TO authenticated;
GRANT ALL ON public.briefs TO service_role;
ALTER TABLE public.briefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Briefs: analyst owns" ON public.briefs FOR ALL TO authenticated
  USING (analyst_id = auth.uid())
  WITH CHECK (analyst_id = auth.uid());

CREATE POLICY "Briefs: client reads published" ON public.briefs FOR SELECT TO authenticated
  USING (
    status = 'published'
    AND client_id IN (SELECT client_id FROM public.profiles WHERE id = auth.uid() AND client_id IS NOT NULL)
  );

-- Brief reads
CREATE TABLE public.brief_reads (
  brief_id UUID NOT NULL REFERENCES public.briefs(id) ON DELETE CASCADE,
  client_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (brief_id, client_user_id)
);
GRANT SELECT, INSERT ON public.brief_reads TO authenticated;
GRANT ALL ON public.brief_reads TO service_role;
ALTER TABLE public.brief_reads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Reads: client inserts own" ON public.brief_reads FOR INSERT TO authenticated
  WITH CHECK (client_user_id = auth.uid());
CREATE POLICY "Reads: client and analyst select" ON public.brief_reads FOR SELECT TO authenticated
  USING (
    client_user_id = auth.uid()
    OR brief_id IN (SELECT id FROM public.briefs WHERE analyst_id = auth.uid())
  );

-- Requests
CREATE TABLE public.requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  brief_id UUID REFERENCES public.briefs(id) ON DELETE SET NULL,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  status public.request_status NOT NULL DEFAULT 'open',
  resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.requests TO authenticated;
GRANT ALL ON public.requests TO service_role;
ALTER TABLE public.requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Requests: client creates own" ON public.requests FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND client_id IN (SELECT client_id FROM public.profiles WHERE id = auth.uid())
  );
CREATE POLICY "Requests: client reads own" ON public.requests FOR SELECT TO authenticated
  USING (
    created_by = auth.uid()
    OR public.has_role(auth.uid(), 'analyst')
    OR public.has_role(auth.uid(), 'admin')
  );
CREATE POLICY "Requests: analyst resolves" ON public.requests FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'analyst') OR public.has_role(auth.uid(), 'admin'));

-- Auto-create profile + role on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  is_first_admin BOOLEAN;
BEGIN
  is_first_admin := LOWER(NEW.email) = 'jon@vangelder.co';

  INSERT INTO public.profiles (id, email, full_name, is_admin)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NULL),
    is_first_admin
  )
  ON CONFLICT (id) DO NOTHING;

  IF is_first_admin THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'analyst') ON CONFLICT DO NOTHING;
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin') ON CONFLICT DO NOTHING;
  ELSE
    -- Default role assigned later by admin invite flow; if no role yet, treat as client
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'client') ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Updated-at trigger for briefs
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER briefs_touch BEFORE UPDATE ON public.briefs
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
