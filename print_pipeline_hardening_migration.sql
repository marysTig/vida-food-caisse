-- Print pipeline hardening (Phase B + C) — run once in the Supabase SQL Editor.
-- Safe to re-run. The app (APK 1.6.0+) degrades gracefully until this is applied:
-- parallel lanes + auto-reroute default ON, fingerprint patch falls back to the
-- legacy read-modify-write, cleanup is skipped.

-- ── 0. Preflight: functions below require table_orders.items to be jsonb ─────
DO $preflight$
DECLARE
  t text;
BEGIN
  SELECT data_type INTO t
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'table_orders' AND column_name = 'items';
  IF t IS DISTINCT FROM 'jsonb' THEN
    RAISE EXCEPTION 'table_orders.items is % — expected jsonb', t;
  END IF;
END
$preflight$;

-- ── 1. Hub settings: Bluetooth lane mode + kitchen auto-reroute ──────────────
ALTER TABLE public.print_settings
  ADD COLUMN IF NOT EXISTS bt_lane_mode text NOT NULL DEFAULT 'parallel',
  ADD COLUMN IF NOT EXISTS kitchen_auto_reroute boolean NOT NULL DEFAULT true;

ALTER TABLE public.print_settings DROP CONSTRAINT IF EXISTS print_settings_bt_lane_mode_check;
ALTER TABLE public.print_settings
  ADD CONSTRAINT print_settings_bt_lane_mode_check
  CHECK (bt_lane_mode = ANY (ARRAY['parallel'::text, 'serialized'::text]));

-- ── 2. Atomic "kitchen lines printed" (native hub after a kitchen ticket) ────
-- Only sets kitchenFingerprint / kitchenPrintedAt on the matching item ids in a
-- single UPDATE — never rewrites lines the cashier added or edited meanwhile.
CREATE OR REPLACE FUNCTION public.mark_kitchen_items_printed(
  p_table_id uuid,
  p_fingerprints jsonb,
  p_printed_at text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n integer;
BEGIN
  IF p_fingerprints IS NULL OR jsonb_typeof(p_fingerprints) <> 'object' THEN
    RETURN 0;
  END IF;

  UPDATE public.table_orders t
  SET
    items = (
      SELECT coalesce(
        jsonb_agg(
          CASE
            WHEN p_fingerprints ? (x.e->>'id') THEN
              x.e || jsonb_build_object(
                'kitchenFingerprint', p_fingerprints->(x.e->>'id'),
                'kitchenPrintedAt', p_printed_at
              )
            ELSE x.e
          END
          ORDER BY x.ord
        ),
        '[]'::jsonb
      )
      FROM jsonb_array_elements(t.items) WITH ORDINALITY AS x(e, ord)
    ),
    updated_at = now()
  WHERE t.table_id = p_table_id
    AND jsonb_typeof(t.items) = 'array'
    AND EXISTS (
      SELECT 1 FROM jsonb_array_elements(t.items) AS y(e)
      WHERE p_fingerprints ? (y.e->>'id')
    );

  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_kitchen_items_printed(uuid, jsonb, text)
  TO anon, authenticated, service_role;

-- ── 3. Keep print marks when a stale client saves the whole order ────────────
-- Waiter/cashier tablets upsert the full items array from local state. If that
-- state predates the hub's print mark, the upsert would erase it and the lines
-- would print again on the next "Valider". For each item id present in both
-- rows, keep the newer kitchenPrintedAt (marks only ever move forward).
CREATE OR REPLACE FUNCTION public.table_orders_keep_kitchen_marks()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.items IS NULL OR NEW.items IS NULL
     OR jsonb_typeof(OLD.items) <> 'array' OR jsonb_typeof(NEW.items) <> 'array' THEN
    RETURN NEW;
  END IF;

  NEW.items := (
    SELECT coalesce(
      jsonb_agg(
        CASE
          WHEN o.e IS NOT NULL
            AND (o.e->>'kitchenFingerprint') IS NOT NULL
            AND coalesce(o.e->>'kitchenPrintedAt', '') > coalesce(n.e->>'kitchenPrintedAt', '')
          THEN n.e || jsonb_build_object(
            'kitchenFingerprint', o.e->'kitchenFingerprint',
            'kitchenPrintedAt', o.e->'kitchenPrintedAt'
          )
          ELSE n.e
        END
        ORDER BY n.ord
      ),
      '[]'::jsonb
    )
    FROM jsonb_array_elements(NEW.items) WITH ORDINALITY AS n(e, ord)
    LEFT JOIN LATERAL (
      SELECT oe.e
      FROM jsonb_array_elements(OLD.items) AS oe(e)
      WHERE oe.e->>'id' = n.e->>'id'
      LIMIT 1
    ) o ON true
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS table_orders_keep_kitchen_marks ON public.table_orders;
CREATE TRIGGER table_orders_keep_kitchen_marks
  BEFORE UPDATE OF items ON public.table_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.table_orders_keep_kitchen_marks();

-- ── 4. print_jobs hygiene ────────────────────────────────────────────────────
-- Stale-printing reclaim (every 15s) and in-flight kitchen dedupe on enqueue.
CREATE INDEX IF NOT EXISTS print_jobs_printing_updated_idx
  ON public.print_jobs (updated_at)
  WHERE status = 'printing';

CREATE INDEX IF NOT EXISTS print_jobs_kitchen_table_idx
  ON public.print_jobs (table_id, status, updated_at)
  WHERE job_type = 'kitchen';

-- Finished jobs carry the full ESC/POS payload; the table was never purged.
-- Called by the native hub every 6h. needs_manual / pending / printing are kept.
CREATE OR REPLACE FUNCTION public.cleanup_print_jobs(p_keep_days integer DEFAULT 7)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n integer;
BEGIN
  IF p_keep_days IS NULL OR p_keep_days < 1 THEN
    p_keep_days := 7;
  END IF;
  DELETE FROM public.print_jobs
  WHERE status IN ('done', 'cancelled')
    AND updated_at < now() - make_interval(days => p_keep_days);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cleanup_print_jobs(integer)
  TO anon, authenticated, service_role;
