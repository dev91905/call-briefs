
CREATE TYPE public.project_role AS ENUM ('owner','co_owner','member');
CREATE TYPE public.entry_status AS ENUM ('draft','published');

CREATE TABLE public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects TO authenticated;
GRANT ALL ON public.projects TO service_role;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.project_members (
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.project_role NOT NULL DEFAULT 'member',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_members TO authenticated;
GRANT ALL ON public.project_members TO service_role;
ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.pending_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  email text NOT NULL,
  role public.project_role NOT NULL DEFAULT 'member',
  invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, email)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pending_invites TO authenticated;
GRANT ALL ON public.pending_invites TO service_role;
ALTER TABLE public.pending_invites ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT 'Untitled',
  entry_date date,
  body text NOT NULL DEFAULT '',
  status public.entry_status NOT NULL DEFAULT 'draft',
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX entries_project_status_idx ON public.entries (project_id, status, published_at DESC);
CREATE INDEX entries_author_idx ON public.entries (author_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.entries TO authenticated;
GRANT ALL ON public.entries TO service_role;
ALTER TABLE public.entries ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.people (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX people_project_name_lower_idx ON public.people (project_id, lower(full_name));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.people TO authenticated;
GRANT ALL ON public.people TO service_role;
ALTER TABLE public.people ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.entry_people (
  entry_id uuid NOT NULL REFERENCES public.entries(id) ON DELETE CASCADE,
  person_id uuid NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  PRIMARY KEY (entry_id, person_id)
);
CREATE INDEX entry_people_person_idx ON public.entry_people (person_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.entry_people TO authenticated;
GRANT ALL ON public.entry_people TO service_role;
ALTER TABLE public.entry_people ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER projects_touch BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER entries_touch BEFORE UPDATE ON public.entries
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.is_project_member(_pid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.project_members WHERE project_id = _pid AND user_id = auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.project_role_of(_pid uuid)
RETURNS public.project_role LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT role FROM public.project_members WHERE project_id = _pid AND user_id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_app_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE((SELECT is_admin FROM public.profiles WHERE id = auth.uid()), false);
$$;

CREATE POLICY "projects: members or admin can read" ON public.projects FOR SELECT TO authenticated
  USING (public.is_project_member(id) OR public.is_app_admin());
CREATE POLICY "projects: any authed can create" ON public.projects FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());
CREATE POLICY "projects: owner/co_owner can update" ON public.projects FOR UPDATE TO authenticated
  USING (public.project_role_of(id) IN ('owner','co_owner') OR public.is_app_admin())
  WITH CHECK (public.project_role_of(id) IN ('owner','co_owner') OR public.is_app_admin());
CREATE POLICY "projects: owner or admin can delete" ON public.projects FOR DELETE TO authenticated
  USING (public.project_role_of(id) = 'owner' OR public.is_app_admin());

CREATE POLICY "members: project members can read" ON public.project_members FOR SELECT TO authenticated
  USING (public.is_project_member(project_id) OR public.is_app_admin());
CREATE POLICY "members: owners can insert" ON public.project_members FOR INSERT TO authenticated
  WITH CHECK (
    public.project_role_of(project_id) IN ('owner','co_owner')
    OR public.is_app_admin()
    OR (user_id = auth.uid() AND role = 'owner'
        AND EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.created_by = auth.uid()))
  );
CREATE POLICY "members: owners can update role" ON public.project_members FOR UPDATE TO authenticated
  USING (public.project_role_of(project_id) IN ('owner','co_owner') OR public.is_app_admin())
  WITH CHECK (public.project_role_of(project_id) IN ('owner','co_owner') OR public.is_app_admin());
CREATE POLICY "members: owners remove or self leave" ON public.project_members FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.project_role_of(project_id) IN ('owner','co_owner') OR public.is_app_admin());

CREATE POLICY "invites: project members read" ON public.pending_invites FOR SELECT TO authenticated
  USING (public.is_project_member(project_id) OR public.is_app_admin());
CREATE POLICY "invites: owners write" ON public.pending_invites FOR ALL TO authenticated
  USING (public.project_role_of(project_id) IN ('owner','co_owner') OR public.is_app_admin())
  WITH CHECK (public.project_role_of(project_id) IN ('owner','co_owner') OR public.is_app_admin());

CREATE POLICY "entries: members read published or own drafts" ON public.entries FOR SELECT TO authenticated
  USING (
    (public.is_project_member(project_id) AND (status = 'published' OR author_id = auth.uid()))
    OR public.is_app_admin()
  );
CREATE POLICY "entries: members insert as author" ON public.entries FOR INSERT TO authenticated
  WITH CHECK (public.is_project_member(project_id) AND author_id = auth.uid());
CREATE POLICY "entries: author updates own draft" ON public.entries FOR UPDATE TO authenticated
  USING (author_id = auth.uid() AND public.is_project_member(project_id))
  WITH CHECK (author_id = auth.uid() AND public.is_project_member(project_id));
CREATE POLICY "entries: author deletes own draft" ON public.entries FOR DELETE TO authenticated
  USING (author_id = auth.uid() AND status = 'draft');

CREATE POLICY "people: members read" ON public.people FOR SELECT TO authenticated
  USING (public.is_project_member(project_id) OR public.is_app_admin());
CREATE POLICY "people: members insert" ON public.people FOR INSERT TO authenticated
  WITH CHECK (public.is_project_member(project_id));
CREATE POLICY "people: owners update" ON public.people FOR UPDATE TO authenticated
  USING (public.project_role_of(project_id) IN ('owner','co_owner') OR public.is_app_admin())
  WITH CHECK (public.project_role_of(project_id) IN ('owner','co_owner') OR public.is_app_admin());
CREATE POLICY "people: owners delete" ON public.people FOR DELETE TO authenticated
  USING (public.project_role_of(project_id) IN ('owner','co_owner') OR public.is_app_admin());

CREATE POLICY "entry_people: members read" ON public.entry_people FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.entries e WHERE e.id = entry_id
                 AND (public.is_project_member(e.project_id) OR public.is_app_admin())));
CREATE POLICY "entry_people: members write" ON public.entry_people FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.entries e WHERE e.id = entry_id AND public.is_project_member(e.project_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.entries e WHERE e.id = entry_id AND public.is_project_member(e.project_id)));

-- ====== Data migration ======
DO $mig$
DECLARE
  v_admin uuid;
  v_client RECORD;
  v_brief RECORD;
  v_project_id uuid;
  v_entry_id uuid;
  v_person_name text;
  v_person_id uuid;
BEGIN
  SELECT id INTO v_admin FROM public.profiles WHERE is_admin = true ORDER BY created_at LIMIT 1;

  FOR v_client IN
    SELECT id, name FROM public.clients WHERE name <> 'Restored Client'
  LOOP
    INSERT INTO public.projects (name, created_by) VALUES (v_client.name, v_admin)
    RETURNING id INTO v_project_id;

    INSERT INTO public.project_members (project_id, user_id, role)
    VALUES (v_project_id, v_admin, 'owner')
    ON CONFLICT DO NOTHING;

    INSERT INTO public.project_members (project_id, user_id, role)
    SELECT v_project_id, p.id,
      CASE WHEN EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id AND ur.role = 'client')
           THEN 'owner'::public.project_role
           ELSE 'member'::public.project_role END
    FROM public.profiles p
    WHERE p.client_id = v_client.id
    ON CONFLICT DO NOTHING;

    INSERT INTO public.project_members (project_id, user_id, role)
    SELECT v_project_id, ur.user_id, 'member'
    FROM public.user_roles ur
    WHERE ur.role IN ('admin','analyst')
    ON CONFLICT DO NOTHING;

    FOR v_brief IN
      SELECT id, analyst_id, call_title, call_date, participants, body, status, published_at, created_at
      FROM public.briefs
      WHERE client_id = v_client.id AND status::text IN ('draft','published')
    LOOP
      INSERT INTO public.entries
        (project_id, author_id, title, entry_date, body, status, published_at, created_at)
      VALUES
        (v_project_id, v_brief.analyst_id,
         COALESCE(NULLIF(v_brief.call_title,''),'Untitled'),
         v_brief.call_date, COALESCE(v_brief.body,''),
         v_brief.status::text::public.entry_status,
         v_brief.published_at, v_brief.created_at)
      RETURNING id INTO v_entry_id;

      INSERT INTO public.project_members (project_id, user_id, role)
      VALUES (v_project_id, v_brief.analyst_id, 'member')
      ON CONFLICT DO NOTHING;

      IF v_brief.participants IS NOT NULL AND length(trim(v_brief.participants)) > 0 THEN
        FOR v_person_name IN
          SELECT trim(p) FROM unnest(string_to_array(v_brief.participants, ',')) AS p
        LOOP
          IF length(v_person_name) = 0 THEN CONTINUE; END IF;
          INSERT INTO public.people (project_id, full_name, created_by)
          VALUES (v_project_id, v_person_name, v_admin)
          ON CONFLICT DO NOTHING;
          SELECT id INTO v_person_id FROM public.people
            WHERE project_id = v_project_id AND lower(full_name) = lower(v_person_name) LIMIT 1;
          INSERT INTO public.entry_people (entry_id, person_id)
          VALUES (v_entry_id, v_person_id) ON CONFLICT DO NOTHING;
        END LOOP;
      END IF;
    END LOOP;
  END LOOP;
END
$mig$;

-- ====== Drop legacy ======
DROP POLICY IF EXISTS "Profiles: self read" ON public.profiles;
DROP POLICY IF EXISTS "Profiles: self update" ON public.profiles;

DROP TABLE IF EXISTS public.brief_reads CASCADE;
DROP TABLE IF EXISTS public.requests CASCADE;
DROP TABLE IF EXISTS public.folder_mappings CASCADE;
DROP TABLE IF EXISTS public.granola_connections CASCADE;
DROP TABLE IF EXISTS public.briefs CASCADE;
DROP TABLE IF EXISTS public.clients CASCADE;
DROP TABLE IF EXISTS public.user_roles CASCADE;

DROP FUNCTION IF EXISTS public.has_role(uuid, public.app_role) CASCADE;
DROP FUNCTION IF EXISTS public.is_portal_admin(uuid, uuid) CASCADE;

DROP TYPE IF EXISTS public.brief_status;
DROP TYPE IF EXISTS public.request_status;
DROP TYPE IF EXISTS public.app_role;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  is_first_admin boolean;
BEGIN
  is_first_admin := LOWER(NEW.email) = 'jon@vangelder.co';
  INSERT INTO public.profiles (id, email, full_name, is_admin)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', NULL), is_first_admin)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE POLICY "Profiles: self or admin read" ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.is_app_admin());
CREATE POLICY "Profiles: self update" ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());
