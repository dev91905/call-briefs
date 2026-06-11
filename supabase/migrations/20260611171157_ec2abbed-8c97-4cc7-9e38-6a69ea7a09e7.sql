ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_client_id_fkey;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE SET NULL;

ALTER TABLE public.briefs DROP CONSTRAINT IF EXISTS briefs_client_id_fkey;
ALTER TABLE public.briefs ADD CONSTRAINT briefs_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;

ALTER TABLE public.requests DROP CONSTRAINT IF EXISTS requests_client_id_fkey;
ALTER TABLE public.requests ADD CONSTRAINT requests_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;

ALTER TABLE public.folder_mappings DROP CONSTRAINT IF EXISTS folder_mappings_client_id_fkey;
ALTER TABLE public.folder_mappings ADD CONSTRAINT folder_mappings_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;