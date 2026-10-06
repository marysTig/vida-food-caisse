-- Atomic batch claim for native HubPrintWorker.
-- Run in Supabase SQL Editor (or apply_migration).

CREATE OR REPLACE FUNCTION public.claim_print_jobs(
  p_device_id text,
  p_limit int DEFAULT 8
)
RETURNS SETOF public.print_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  receipt_hold boolean;
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

  SELECT EXISTS (
    SELECT 1
    FROM public.print_jobs j
    WHERE j.job_type = 'receipt'
      AND (
        j.status = 'printing'
        OR (j.status = 'pending' AND j.next_attempt_at <= now())
      )
  ) INTO receipt_hold;

  RETURN QUERY
  WITH picked AS (
    SELECT j.id
    FROM public.print_jobs j
    WHERE j.status = 'pending'
      AND j.next_attempt_at <= now()
      AND (
        NOT receipt_hold
        OR j.job_type = 'receipt'
      )
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
