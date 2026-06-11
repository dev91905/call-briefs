DO $$
DECLARE jid bigint;
BEGIN
  FOR jid IN SELECT jobid FROM cron.job WHERE jobname IN ('poll-granola', 'granola-poll') LOOP
    PERFORM cron.unschedule(jid);
  END LOOP;
END $$;