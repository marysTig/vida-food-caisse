-- Add consolidated kitchen fallback printer (run after kitchen_print_migration.sql)

ALTER TABLE public.print_settings
  ADD COLUMN IF NOT EXISTS fallback_kitchen_printer_id uuid REFERENCES public.printers(id) ON DELETE SET NULL;
