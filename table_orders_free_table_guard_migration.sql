-- Leftover items from a previous order showing up in a new table order.
-- Freeing a table relied on each client successfully deleting table_orders;
-- a failed delete (network blip) or a late save from another device left the
-- old order attached to the free table, and the next customer inherited it.
-- These triggers enforce the rule in the database, whatever the client does.

-- ── 1. Freeing a table deletes its order ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.tables_clear_order_on_free()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'libre' AND OLD.status IS DISTINCT FROM 'libre' THEN
    DELETE FROM public.table_orders WHERE table_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tables_clear_order_on_free ON public.tables;
CREATE TRIGGER tables_clear_order_on_free
  AFTER UPDATE OF status ON public.tables
  FOR EACH ROW
  EXECUTE FUNCTION public.tables_clear_order_on_free();

-- ── 2. A free table cannot hold already-printed lines ────────────────────────
-- Kitchen printing only happens after "Valider", which marks the table
-- occupied — so printed lines on a free table belong to a finished order
-- (e.g. a stale save landing after checkout). Unprinted draft lines are kept.
-- Fires after table_orders_keep_kitchen_marks (BEFORE triggers run by name).
CREATE OR REPLACE FUNCTION public.table_orders_strip_stale_printed()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  st text;
BEGIN
  IF NEW.items IS NULL OR jsonb_typeof(NEW.items) <> 'array' THEN
    RETURN NEW;
  END IF;
  SELECT status INTO st FROM public.tables WHERE id = NEW.table_id;
  IF st = 'libre' THEN
    NEW.items := coalesce(
      (
        SELECT jsonb_agg(x.e ORDER BY x.ord)
        FROM jsonb_array_elements(NEW.items) WITH ORDINALITY AS x(e, ord)
        WHERE (x.e->>'kitchenPrintedAt') IS NULL
      ),
      '[]'::jsonb
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS table_orders_strip_stale_printed ON public.table_orders;
CREATE TRIGGER table_orders_strip_stale_printed
  BEFORE INSERT OR UPDATE ON public.table_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.table_orders_strip_stale_printed();
