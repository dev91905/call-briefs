
-- =========================================================================
-- Portals rebuild migration
-- =========================================================================

-- 1. Archive legacy tables (keep data, hide from API by revoking grants)
ALTER TABLE IF EXISTS public.briefs RENAME TO legacy_briefs;
ALTER TABLE IF EXISTS public.brief_reads RENAME TO legacy_brief_reads;
ALTER TABLE IF EXISTS public.requests RENAME TO legacy_requests;
ALTER TABLE IF EXISTS public.granola_connections RENAME TO legacy_granola_connections;
ALTER TABLE IF EXISTS public.folder_mappings RENAME TO legacy_folder_mappings;

REVOKE ALL ON public.legacy_briefs FROM anon, authenticated;
REVOKE ALL ON public.legacy_brief_reads FROM anon, authenticated;
REVOKE ALL ON public.legacy_requests FROM anon, authenticated;
REVOKE ALL ON public.legacy_granola_connections FROM anon, authenticated;
REVOKE ALL ON public.legacy_folder_mappings FROM anon, authenticated;

-- 2. Portal role enum
DO $$ BEGIN
  CREATE TYPE public.portal_role AS ENUM ('owner', 'co_owner', 'analyst');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3. portals
CREATE TABLE public.portals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.portals TO authenticated;
GRANT ALL ON public.portals TO service_role;
ALTER TABLE public.portals ENABLE ROW LEVEL SECURITY;

-- 4. portal_members
CREATE TABLE public.portal_members (
  portal_id uuid NOT NULL REFERENCES public.portals(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.portal_role NOT NULL DEFAULT 'analyst',
  invited_by uuid REFERENCES auth.users(id),
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (portal_id, user_id)
);
CREATE INDEX idx_portal_members_user ON public.portal_members(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.portal_members TO authenticated;
GRANT ALL ON public.portal_members TO service_role;
ALTER TABLE public.portal_members ENABLE ROW LEVEL SECURITY;

-- 5. security-definer helpers (no recursion)
CREATE OR REPLACE FUNCTION public.is_portal_member(_user uuid, _portal uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.portal_members WHERE user_id = _user AND portal_id = _portal)
$$;

CREATE OR REPLACE FUNCTION public.portal_member_role(_user uuid, _portal uuid)
RETURNS public.portal_role LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.portal_members WHERE user_id = _user AND portal_id = _portal
$$;

CREATE OR REPLACE FUNCTION public.is_portal_admin(_user uuid, _portal uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.portal_members
    WHERE user_id = _user AND portal_id = _portal AND role IN ('owner','co_owner'))
$$;

-- 6. portal_people
CREATE TABLE public.portal_people (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portal_id uuid NOT NULL REFERENCES public.portals(id) ON DELETE CASCADE,
  name text NOT NULL,
  org text,
  title text,
  email text,
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_portal_people_portal ON public.portal_people(portal_id);
CREATE INDEX idx_portal_people_name ON public.portal_people(portal_id, lower(name));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.portal_people TO authenticated;
GRANT ALL ON public.portal_people TO service_role;
ALTER TABLE public.portal_people ENABLE ROW LEVEL SECURITY;

-- 7. portal_relationships
CREATE TABLE public.portal_relationships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portal_id uuid NOT NULL REFERENCES public.portals(id) ON DELETE CASCADE,
  from_person_id uuid NOT NULL REFERENCES public.portal_people(id) ON DELETE CASCADE,
  to_person_id uuid NOT NULL REFERENCES public.portal_people(id) ON DELETE CASCADE,
  type text NOT NULL DEFAULT 'knows',
  note text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (from_person_id <> to_person_id)
);
CREATE INDEX idx_portal_relationships_portal ON public.portal_relationships(portal_id);
CREATE INDEX idx_portal_relationships_from ON public.portal_relationships(from_person_id);
CREATE INDEX idx_portal_relationships_to ON public.portal_relationships(to_person_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.portal_relationships TO authenticated;
GRANT ALL ON public.portal_relationships TO service_role;
ALTER TABLE public.portal_relationships ENABLE ROW LEVEL SECURITY;

-- 8. portal_form_schema
CREATE TABLE public.portal_form_schema (
  portal_id uuid PRIMARY KEY REFERENCES public.portals(id) ON DELETE CASCADE,
  fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  relationship_types jsonb NOT NULL DEFAULT '["knows","works with","reports to","donor to","family","mentor","introduced by"]'::jsonb,
  updated_by uuid REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.portal_form_schema TO authenticated;
GRANT ALL ON public.portal_form_schema TO service_role;
ALTER TABLE public.portal_form_schema ENABLE ROW LEVEL SECURITY;

-- 9. portal_entries
CREATE TABLE public.portal_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portal_id uuid NOT NULL REFERENCES public.portals(id) ON DELETE CASCADE,
  subject_person_id uuid REFERENCES public.portal_people(id) ON DELETE SET NULL,
  talked_to text,
  readout jsonb,
  call_date date,
  custom jsonb NOT NULL DEFAULT '{}'::jsonb,
  author_id uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_portal_entries_portal ON public.portal_entries(portal_id, created_at DESC);
CREATE INDEX idx_portal_entries_subject ON public.portal_entries(subject_person_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.portal_entries TO authenticated;
GRANT ALL ON public.portal_entries TO service_role;
ALTER TABLE public.portal_entries ENABLE ROW LEVEL SECURITY;

-- 10. portal_entry_mentions
CREATE TABLE public.portal_entry_mentions (
  entry_id uuid NOT NULL REFERENCES public.portal_entries(id) ON DELETE CASCADE,
  person_id uuid NOT NULL REFERENCES public.portal_people(id) ON DELETE CASCADE,
  PRIMARY KEY (entry_id, person_id)
);
CREATE INDEX idx_portal_entry_mentions_person ON public.portal_entry_mentions(person_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.portal_entry_mentions TO authenticated;
GRANT ALL ON public.portal_entry_mentions TO service_role;
ALTER TABLE public.portal_entry_mentions ENABLE ROW LEVEL SECURITY;

-- 11. portal_requests
CREATE TABLE public.portal_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portal_id uuid NOT NULL REFERENCES public.portals(id) ON DELETE CASCADE,
  subject text NOT NULL,
  body text,
  status text NOT NULL DEFAULT 'open',
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_portal_requests_portal ON public.portal_requests(portal_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.portal_requests TO authenticated;
GRANT ALL ON public.portal_requests TO service_role;
ALTER TABLE public.portal_requests ENABLE ROW LEVEL SECURITY;

-- 12. RLS policies — portals
CREATE POLICY "members read portal" ON public.portals FOR SELECT TO authenticated
  USING (public.is_portal_member(auth.uid(), id));
CREATE POLICY "any auth user creates portal" ON public.portals FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());
CREATE POLICY "owners update portal" ON public.portals FOR UPDATE TO authenticated
  USING (public.is_portal_admin(auth.uid(), id))
  WITH CHECK (public.is_portal_admin(auth.uid(), id));
CREATE POLICY "owner deletes portal" ON public.portals FOR DELETE TO authenticated
  USING (owner_id = auth.uid());

-- portal_members
CREATE POLICY "members read members" ON public.portal_members FOR SELECT TO authenticated
  USING (public.is_portal_member(auth.uid(), portal_id));
CREATE POLICY "owners manage members" ON public.portal_members FOR INSERT TO authenticated
  WITH CHECK (public.is_portal_admin(auth.uid(), portal_id) OR user_id = auth.uid());
CREATE POLICY "owners update members" ON public.portal_members FOR UPDATE TO authenticated
  USING (public.is_portal_admin(auth.uid(), portal_id))
  WITH CHECK (public.is_portal_admin(auth.uid(), portal_id));
CREATE POLICY "owners delete members" ON public.portal_members FOR DELETE TO authenticated
  USING (public.is_portal_admin(auth.uid(), portal_id) OR user_id = auth.uid());

-- portal_people
CREATE POLICY "members rw people" ON public.portal_people FOR ALL TO authenticated
  USING (public.is_portal_member(auth.uid(), portal_id))
  WITH CHECK (public.is_portal_member(auth.uid(), portal_id));

-- portal_relationships
CREATE POLICY "members rw relationships" ON public.portal_relationships FOR ALL TO authenticated
  USING (public.is_portal_member(auth.uid(), portal_id))
  WITH CHECK (public.is_portal_member(auth.uid(), portal_id));

-- portal_form_schema
CREATE POLICY "members read schema" ON public.portal_form_schema FOR SELECT TO authenticated
  USING (public.is_portal_member(auth.uid(), portal_id));
CREATE POLICY "owners write schema" ON public.portal_form_schema FOR INSERT TO authenticated
  WITH CHECK (public.is_portal_admin(auth.uid(), portal_id));
CREATE POLICY "owners update schema" ON public.portal_form_schema FOR UPDATE TO authenticated
  USING (public.is_portal_admin(auth.uid(), portal_id))
  WITH CHECK (public.is_portal_admin(auth.uid(), portal_id));

-- portal_entries
CREATE POLICY "members rw entries" ON public.portal_entries FOR ALL TO authenticated
  USING (public.is_portal_member(auth.uid(), portal_id))
  WITH CHECK (public.is_portal_member(auth.uid(), portal_id));

-- portal_entry_mentions (gated via entry's portal)
CREATE POLICY "members rw mentions" ON public.portal_entry_mentions FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.portal_entries e
                 WHERE e.id = entry_id AND public.is_portal_member(auth.uid(), e.portal_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.portal_entries e
                 WHERE e.id = entry_id AND public.is_portal_member(auth.uid(), e.portal_id)));

-- portal_requests
CREATE POLICY "members rw requests" ON public.portal_requests FOR ALL TO authenticated
  USING (public.is_portal_member(auth.uid(), portal_id))
  WITH CHECK (public.is_portal_member(auth.uid(), portal_id));

-- 13. updated_at triggers
CREATE TRIGGER touch_portals BEFORE UPDATE ON public.portals
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER touch_portal_people BEFORE UPDATE ON public.portal_people
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER touch_portal_entries BEFORE UPDATE ON public.portal_entries
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER touch_portal_requests BEFORE UPDATE ON public.portal_requests
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 14. Migrate existing clients into portals, owned by current admin
INSERT INTO public.portals (id, name, slug, owner_id)
SELECT
  c.id,
  c.name,
  lower(regexp_replace(c.name, '[^a-zA-Z0-9]+', '-', 'g')) || '-' || substr(c.id::text, 1, 8),
  (SELECT id FROM public.profiles WHERE is_admin = true ORDER BY id LIMIT 1)
FROM public.clients c
WHERE EXISTS (SELECT 1 FROM public.profiles WHERE is_admin = true);

-- Make admin owner-member of each portal
INSERT INTO public.portal_members (portal_id, user_id, role)
SELECT p.id, p.owner_id, 'owner'::public.portal_role FROM public.portals p
ON CONFLICT DO NOTHING;

-- Seed default form schema for each portal
INSERT INTO public.portal_form_schema (portal_id, fields)
SELECT id, '[]'::jsonb FROM public.portals
ON CONFLICT DO NOTHING;

-- 15. Drop old clients table (data preserved via portals)
DROP TABLE IF EXISTS public.clients CASCADE;
