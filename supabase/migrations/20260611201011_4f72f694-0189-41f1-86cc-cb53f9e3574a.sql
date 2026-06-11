
-- groups
CREATE TABLE public.groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX groups_project_lower_name_key ON public.groups(project_id, lower(name));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.groups TO authenticated;
GRANT ALL ON public.groups TO service_role;
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "groups: members read" ON public.groups
  FOR SELECT TO authenticated USING (public.is_project_member(project_id));
CREATE POLICY "groups: members insert" ON public.groups
  FOR INSERT TO authenticated WITH CHECK (public.is_project_member(project_id) AND created_by = auth.uid());
CREATE POLICY "groups: owners update" ON public.groups
  FOR UPDATE TO authenticated
  USING (public.project_role_of(project_id) IN ('owner','co_owner'))
  WITH CHECK (public.project_role_of(project_id) IN ('owner','co_owner'));
CREATE POLICY "groups: owners delete" ON public.groups
  FOR DELETE TO authenticated
  USING (public.project_role_of(project_id) IN ('owner','co_owner'));

CREATE TRIGGER groups_touch BEFORE UPDATE ON public.groups
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- entry_groups
CREATE TABLE public.entry_groups (
  entry_id uuid NOT NULL REFERENCES public.entries(id) ON DELETE CASCADE,
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  PRIMARY KEY (entry_id, group_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.entry_groups TO authenticated;
GRANT ALL ON public.entry_groups TO service_role;
ALTER TABLE public.entry_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "entry_groups: members read" ON public.entry_groups
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.entries e WHERE e.id = entry_id AND public.is_project_member(e.project_id))
  );
CREATE POLICY "entry_groups: members write" ON public.entry_groups
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM public.entries e WHERE e.id = entry_id AND public.is_project_member(e.project_id))
  );
CREATE POLICY "entry_groups: members delete" ON public.entry_groups
  FOR DELETE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.entries e WHERE e.id = entry_id AND public.is_project_member(e.project_id))
  );

-- tags
CREATE TABLE public.tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX tags_project_lower_name_key ON public.tags(project_id, lower(name));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tags TO authenticated;
GRANT ALL ON public.tags TO service_role;
ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tags: members read" ON public.tags
  FOR SELECT TO authenticated USING (public.is_project_member(project_id));
CREATE POLICY "tags: members insert" ON public.tags
  FOR INSERT TO authenticated WITH CHECK (public.is_project_member(project_id));
CREATE POLICY "tags: owners delete" ON public.tags
  FOR DELETE TO authenticated USING (public.project_role_of(project_id) IN ('owner','co_owner'));

-- entry_tags
CREATE TABLE public.entry_tags (
  entry_id uuid NOT NULL REFERENCES public.entries(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  PRIMARY KEY (entry_id, tag_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.entry_tags TO authenticated;
GRANT ALL ON public.entry_tags TO service_role;
ALTER TABLE public.entry_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "entry_tags: members read" ON public.entry_tags
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.entries e WHERE e.id = entry_id AND public.is_project_member(e.project_id))
  );
CREATE POLICY "entry_tags: members write" ON public.entry_tags
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM public.entries e WHERE e.id = entry_id AND public.is_project_member(e.project_id))
  );
CREATE POLICY "entry_tags: members delete" ON public.entry_tags
  FOR DELETE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.entries e WHERE e.id = entry_id AND public.is_project_member(e.project_id))
  );

-- entry_people role
ALTER TABLE public.entry_people
  ADD COLUMN role text NOT NULL DEFAULT 'participant'
  CHECK (role IN ('participant','mentioned'));
