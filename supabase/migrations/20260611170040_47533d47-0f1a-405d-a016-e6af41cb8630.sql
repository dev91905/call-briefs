
-- Drop portal tables (cascade drops policies, indexes, fks)
DROP TABLE IF EXISTS public.portal_entry_mentions CASCADE;
DROP TABLE IF EXISTS public.portal_entries CASCADE;
DROP TABLE IF EXISTS public.portal_requests CASCADE;
DROP TABLE IF EXISTS public.portal_form_schema CASCADE;
DROP TABLE IF EXISTS public.portal_relationships CASCADE;
DROP TABLE IF EXISTS public.portal_people CASCADE;
DROP TABLE IF EXISTS public.portal_members CASCADE;
DROP TABLE IF EXISTS public.portals CASCADE;
DROP FUNCTION IF EXISTS public.is_portal_member(uuid, uuid) CASCADE;
DROP FUNCTION IF EXISTS public.portal_member_role(uuid, uuid) CASCADE;
DROP TYPE IF EXISTS public.portal_role;

-- Restore legacy tables
ALTER TABLE IF EXISTS public.legacy_briefs RENAME TO briefs;
ALTER TABLE IF EXISTS public.legacy_brief_reads RENAME TO brief_reads;
ALTER TABLE IF EXISTS public.legacy_requests RENAME TO requests;
ALTER TABLE IF EXISTS public.legacy_granola_connections RENAME TO granola_connections;
ALTER TABLE IF EXISTS public.legacy_folder_mappings RENAME TO folder_mappings;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.briefs TO authenticated;
GRANT ALL ON public.briefs TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.brief_reads TO authenticated;
GRANT ALL ON public.brief_reads TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.requests TO authenticated;
GRANT ALL ON public.requests TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.granola_connections TO authenticated;
GRANT ALL ON public.granola_connections TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.folder_mappings TO authenticated;
GRANT ALL ON public.folder_mappings TO service_role;
