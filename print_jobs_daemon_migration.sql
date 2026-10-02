-- print_jobs for PrintQueueDaemon
-- Copy ALL of this into Supabase SQL Editor, then Run.
-- Tip: if it fails, first run only the smoke test at the bottom.

CREATE TABLE IF NOT EXISTS public.print_jobs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  table_id uuid NULL,
  job_type text NOT NULL,
  priority integer NOT NULL DEFAULT 10,
  printer_id uuid NULL,
  printer_name text NULL,
  mac_address text NULL,
  idempotency_key text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  attempt_count integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  claimed_by_device_id text NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  error text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  printed_at timestamptz NULL,
  PRIMARY KEY (id),
  UNIQUE (idempotency_key),
  CHECK (job_type = ANY (ARRAY['kitchen'::text, 'receipt'::text])),
  CHECK (status = ANY (ARRAY['pending'::text, 'printing'::text, 'done'::text, 'needs_manual'::text, 'cancelled'::text]))
);

CREATE INDEX IF NOT EXISTS print_jobs_drain_idx
  ON public.print_jobs (status, priority DESC, next_attempt_at, created_at);

CREATE INDEX IF NOT EXISTS print_jobs_needs_manual_idx
  ON public.print_jobs (status)
  WHERE status = 'needs_manual';

ALTER TABLE public.print_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all access on print_jobs" ON public.print_jobs;

CREATE POLICY "Allow all access on print_jobs"
  ON public.print_jobs
  FOR ALL
  USING (true)
  WITH CHECK (true);

DO $print_jobs_realtime$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.print_jobs;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$print_jobs_realtime$;

-- SMOKE TEST (optional): uncomment these 2 lines alone if CREATE still fails
-- CREATE TABLE IF NOT EXISTS public._uuid_smoke (id uuid PRIMARY KEY);
-- DROP TABLE IF EXISTS public._uuid_smoke;
