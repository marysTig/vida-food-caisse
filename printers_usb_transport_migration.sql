-- USB transport for Caisse (OTG) alongside Bluetooth kitchen.
-- Apply in Supabase SQL Editor if MCP migration was not used.

ALTER TABLE public.printers
  ADD COLUMN IF NOT EXISTS transport text NOT NULL DEFAULT 'bluetooth',
  ADD COLUMN IF NOT EXISTS usb_vendor_id integer,
  ADD COLUMN IF NOT EXISTS usb_product_id integer;

ALTER TABLE public.printers DROP CONSTRAINT IF EXISTS printers_transport_check;
ALTER TABLE public.printers
  ADD CONSTRAINT printers_transport_check
  CHECK (transport = ANY (ARRAY['bluetooth'::text, 'usb'::text]));

ALTER TABLE public.print_jobs
  ADD COLUMN IF NOT EXISTS transport text NOT NULL DEFAULT 'bluetooth',
  ADD COLUMN IF NOT EXISTS usb_vendor_id integer,
  ADD COLUMN IF NOT EXISTS usb_product_id integer;

ALTER TABLE public.print_jobs DROP CONSTRAINT IF EXISTS print_jobs_transport_check;
ALTER TABLE public.print_jobs
  ADD CONSTRAINT print_jobs_transport_check
  CHECK (transport = ANY (ARRAY['bluetooth'::text, 'usb'::text]));

-- Parallel USB receipt + BT kitchen: do not block kitchen claims on pending receipts.
CREATE OR REPLACE FUNCTION public.claim_print_jobs(
  p_device_id text,
  p_limit int DEFAULT 8
)
RETURNS SETOF public.print_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_device_id IS NULL OR length(trim(p_device_id)) = 0 THEN
    RAISE EXCEPTION 'p_device_id required';
  END IF;
  IF p_limit IS NULL OR p_limit < 1 THEN
    p_limit := 8;
  END IF;
  IF p_limit > 20 THEN
    p_limit := 20;
  END IF;

  RETURN QUERY
  WITH picked AS (
    SELECT j.id
    FROM public.print_jobs j
    WHERE j.status = 'pending'
      AND j.next_attempt_at <= now()
    ORDER BY j.priority DESC, j.created_at ASC
    FOR UPDATE OF j SKIP LOCKED
    LIMIT p_limit
  ),
  updated AS (
    UPDATE public.print_jobs p
    SET
      status = 'printing',
      claimed_by_device_id = p_device_id,
      error = NULL,
      updated_at = now()
    FROM picked
    WHERE p.id = picked.id
    RETURNING p.*
  )
  SELECT * FROM updated
  ORDER BY priority DESC, created_at ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_print_jobs(text, int) TO anon, authenticated, service_role;
