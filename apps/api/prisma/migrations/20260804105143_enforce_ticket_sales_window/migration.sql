CREATE OR REPLACE FUNCTION enforce_ticket_sales_window()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  draw_status TEXT;
BEGIN
  SELECT "status"::TEXT
  INTO draw_status
  FROM "lottery_draws"
  WHERE "id" = NEW."drawId";

  IF draw_status IS NULL THEN
    RAISE EXCEPTION
      'Cannot issue a ticket for an unknown draw'
      USING ERRCODE = '23503';
  END IF;

  IF draw_status <> 'SALES_OPEN' THEN
    RAISE EXCEPTION
      'Tickets can only be issued while draw sales are open'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER tickets_enforce_sales_window
BEFORE INSERT ON "tickets"
FOR EACH ROW
EXECUTE FUNCTION enforce_ticket_sales_window();