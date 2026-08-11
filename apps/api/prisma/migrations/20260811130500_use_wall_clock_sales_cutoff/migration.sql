-- SEC-001 Block 1 hardening
-- PostgreSQL CURRENT_TIMESTAMP is fixed at transaction start.
-- Use clock_timestamp() so ticket issuance is checked against actual wall-clock time.

CREATE OR REPLACE FUNCTION enforce_ticket_sales_window()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  draw_status TEXT;
  sales_open_at TIMESTAMPTZ;
  sales_close_at TIMESTAMPTZ;
  scheduled_draw_at TIMESTAMPTZ;
  effective_cutoff TIMESTAMPTZ;
  wall_clock_now TIMESTAMPTZ;
BEGIN
  SELECT
    "status"::TEXT,
    "salesOpenAt",
    "salesCloseAt",
    "scheduledDrawAt"
  INTO
    draw_status,
    sales_open_at,
    sales_close_at,
    scheduled_draw_at
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

  wall_clock_now := clock_timestamp();

  IF sales_open_at IS NOT NULL
     AND wall_clock_now < sales_open_at THEN
    RAISE EXCEPTION
      'Tickets cannot be issued before salesOpenAt'
      USING ERRCODE = '23514';
  END IF;

  effective_cutoff :=
    scheduled_draw_at - INTERVAL '10 minutes';

  IF sales_close_at IS NOT NULL
     AND sales_close_at < effective_cutoff THEN
    effective_cutoff := sales_close_at;
  END IF;

  IF wall_clock_now >= effective_cutoff THEN
    RAISE EXCEPTION
      'Tickets cannot be issued after the hard sales cutoff'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;
