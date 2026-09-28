-- Unified print_jobs for PrintQueueDaemon (kitchen + receipt)
-- Run in Supabase SQL Editor after kitchen_print_migration.sql

CREATE TABLE IF NOT EXISTS public.print_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id uuid,
  job_type text NOT NULL CHECK (job_type IN ('kitchen', 'receipt')),
  priority integer NOT NULL DEFAULT 10,
  printer_id uuid,
  printer_name text,
  mac_address text,
  idempotency_key text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'printing', 'done', 'needs_manual', 'cancelled')),
  attempt_count integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  claimed_by_device_id text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  printed_at timestamptz,
  CONSTRAINT print_jobs_idempotency_key_unique UNIQUE (idempotency_key)
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

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.print_jobs;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Also allow needs_manual / failed on legacy kitchen_print_jobs if still used
DO $$
BEGIN
  ALTER TABLE public.kitchen_print_jobs DROP CONSTRAINT IF EXISTS kitchen_print_jobs_status_check;
EXCEPTION
  WHEN undefined_object THEN NULL;
END $$;
