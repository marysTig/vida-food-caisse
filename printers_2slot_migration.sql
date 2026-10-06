-- Two-printer hub: Caisse (receipts) + Cuisine (kitchen only).
-- Run in Supabase SQL Editor, then reload the app.

-- 1) Allow the new type (keep legacy values briefly so UPDATE can run)
ALTER TABLE public.printers DROP CONSTRAINT IF EXISTS printers_type_check;
ALTER TABLE public.printers
  ADD CONSTRAINT printers_type_check
  CHECK (type = ANY (ARRAY['caisse'::text, 'cuisine'::text, 'plaque'::text, 'four'::text]));

-- 2) Collapse plaque/four → cuisine (catch-all: clear category filters)
UPDATE public.printers
SET
  type = 'cuisine',
  category_ids = '{}',
  categories = '{}'
WHERE type IN ('plaque', 'four');

-- Also clear filters on existing cuisine rows so one kitchen MAC prints everything
UPDATE public.printers
SET category_ids = '{}', categories = '{}'
WHERE type = 'cuisine';

-- 3) Keep a single enabled Cuisine row (oldest with a MAC preferred)
WITH cuisine_ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      ORDER BY
        CASE WHEN coalesce(trim(mac_address), '') <> '' THEN 0 ELSE 1 END,
        created_at ASC
    ) AS rn
  FROM public.printers
  WHERE type = 'cuisine'
)
UPDATE public.printers p
SET enabled = false
FROM cuisine_ranked r
WHERE p.id = r.id
  AND r.rn > 1
  AND p.enabled = true;

-- 4) Keep a single enabled Caisse row
WITH caisse_ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      ORDER BY
        CASE WHEN coalesce(trim(mac_address), '') <> '' THEN 0 ELSE 1 END,
        created_at ASC
    ) AS rn
  FROM public.printers
  WHERE type = 'caisse'
)
UPDATE public.printers p
SET enabled = false
FROM caisse_ranked r
WHERE p.id = r.id
  AND r.rn > 1
  AND p.enabled = true;

-- 5) Lock constraint to the two profiles only
ALTER TABLE public.printers DROP CONSTRAINT IF EXISTS printers_type_check;
ALTER TABLE public.printers
  ADD CONSTRAINT printers_type_check
  CHECK (type = ANY (ARRAY['caisse'::text, 'cuisine'::text]));
