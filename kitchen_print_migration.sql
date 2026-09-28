-- Kitchen print queue + primary hub + category_id routing
-- Run in Supabase SQL Editor.

-- ── 1. printers.category_ids (UUID routing; keep categories text[] for rollback) ─

ALTER TABLE public.printers
  ADD COLUMN IF NOT EXISTS category_ids uuid[] NOT NULL DEFAULT '{}';

-- Backfill category_ids from legacy name array when categories table exists
UPDATE public.printers p
SET category_ids = COALESCE((
  SELECT ARRAY_AGG(c.id ORDER BY c.name)
  FROM public.categories c
  WHERE c.name = ANY (COALESCE(p.categories, '{}'::text[]))
), '{}'::uuid[])
WHERE COALESCE(cardinality(p.category_ids), 0) = 0
  AND COALESCE(cardinality(p.categories), 0) > 0;

-- ── 2. print_settings (singleton: which device is the primary print hub) ───────

CREATE TABLE IF NOT EXISTS public.print_settings (
  id uuid PRIMARY KEY DEFAULT '00000000-0000-4000-8000-000000000001'::uuid,
  primary_device_id text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.print_settings (id, primary_device_id)
VALUES ('00000000-0000-4000-8000-000000000001'::uuid, '')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.print_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all access on print_settings" ON public.print_settings;
CREATE POLICY "Allow all access on print_settings"
  ON public.print_settings
  FOR ALL
  USING (true)
  WITH CHECK (true);

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.print_settings;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ── 3. kitchen_print_jobs (durable, idempotent queue) ─────────────────────────

CREATE TABLE IF NOT EXISTS public.kitchen_print_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id uuid NOT NULL,
  idempotency_key text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'printing', 'done', 'failed', 'cancelled')),
  claimed_by_device_id text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  printed_at timestamptz,
  CONSTRAINT kitchen_print_jobs_idempotency_key_unique UNIQUE (idempotency_key)
);

CREATE INDEX IF NOT EXISTS kitchen_print_jobs_status_created_idx
  ON public.kitchen_print_jobs (status, created_at);

CREATE INDEX IF NOT EXISTS kitchen_print_jobs_table_id_idx
  ON public.kitchen_print_jobs (table_id);

ALTER TABLE public.kitchen_print_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all access on kitchen_print_jobs" ON public.kitchen_print_jobs;
CREATE POLICY "Allow all access on kitchen_print_jobs"
  ON public.kitchen_print_jobs
  FOR ALL
  USING (true)
  WITH CHECK (true);

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.kitchen_print_jobs;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
