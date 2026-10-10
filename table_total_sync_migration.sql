-- tables.order_total follows the order's items, always.
-- Until now the total was a number written by the server tablet in a separate
-- request from the order itself. If one of the two writes failed or was
-- overwritten, the Caisse saw "occupied, 750 DA" with no order — or an order
-- with a 0 DA card. Now every save of table_orders.items recomputes the total
-- of an OCCUPIED table in the database (same formula as cartSubtotal in
-- src/lib/cart.ts: customPrice, else option price, else product price, times
-- quantity, plus the line's supplements once).

CREATE OR REPLACE FUNCTION public.order_items_total(items jsonb)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT coalesce(sum(
    coalesce(
      (e->>'customPrice')::numeric,
      (e->'selectedOption'->>'price')::numeric,
      (e->'product'->>'price')::numeric
    ) * coalesce((e->>'quantity')::numeric, 0)
    + coalesce((
        SELECT sum((s->>'price')::numeric)
        FROM jsonb_array_elements(
          CASE WHEN jsonb_typeof(e->'supplements') = 'array' THEN e->'supplements' ELSE '[]'::jsonb END
        ) s
      ), 0)
  ), 0)
  FROM jsonb_array_elements(
    CASE WHEN jsonb_typeof(items) = 'array' THEN items ELSE '[]'::jsonb END
  ) e
$$;

CREATE OR REPLACE FUNCTION public.table_orders_sync_total()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  total integer := round(public.order_items_total(NEW.items))::integer;
BEGIN
  -- Free tables hold drafts only: the total is set when the table is validated.
  UPDATE public.tables
  SET order_total = total
  WHERE id = NEW.table_id
    AND status = 'occupee'
    AND order_total IS DISTINCT FROM total;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS table_orders_sync_total ON public.table_orders;
CREATE TRIGGER table_orders_sync_total
  AFTER INSERT OR UPDATE OF items ON public.table_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.table_orders_sync_total();
