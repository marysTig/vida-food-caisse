-- Migration: Add supplement snapshot columns to z_report_history
-- Run this once in your Supabase SQL editor.
-- These columns are OPTIONAL — the code has a graceful fallback if they don't exist.

ALTER TABLE public.z_report_history
ADD COLUMN IF NOT EXISTS supplements JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS supplements_total NUMERIC DEFAULT 0;

-- Optional: add a comment for clarity
COMMENT ON COLUMN public.z_report_history.supplements IS
  'Snapshot of supplements at time of payment: [{id, label, price}]. Preserved even if supplements are later renamed or deleted.';
COMMENT ON COLUMN public.z_report_history.supplements_total IS
  'Sum of all supplement prices for this line item at time of payment.';
