-- SEC-004 DB-bound ticket issuance.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "tickets" AS t
    JOIN "purchases" AS p ON p."id" = t."purchaseId"
    LEFT JOIN "ticket_allocations" AS a ON a."purchaseId" = t."purchaseId"
    WHERE
      t."userId" IS DISTINCT FROM p."userId"
      OR t."drawId" IS DISTINCT FROM p."drawId"
      OR a."purchaseId" IS NULL
      OR a."drawId" IS DISTINCT FROM t."drawId"
      OR t."numberInDraw" < a."startNumber"
      OR t."numberInDraw" > a."endNumber"
  ) THEN
    RAISE EXCEPTION 'Existing ticket data violates DB-bound ticket issuance invariants';
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS "purchases_id_userId_drawId_key"
ON "purchases" ("id", "userId", "drawId");

CREATE UNIQUE INDEX IF NOT EXISTS "ticket_allocations_purchaseId_drawId_key"
ON "ticket_allocations" ("purchaseId", "drawId");

ALTER TABLE "tickets"
  ADD CONSTRAINT "tickets_purchase_identity_fkey"
  FOREIGN KEY ("purchaseId", "userId", "drawId")
  REFERENCES "purchases" ("id", "userId", "drawId")
  ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "tickets"
  ADD CONSTRAINT "tickets_purchase_allocation_fkey"
  FOREIGN KEY ("purchaseId", "drawId")
  REFERENCES "ticket_allocations" ("purchaseId", "drawId")
  ON DELETE RESTRICT ON UPDATE RESTRICT;

CREATE OR REPLACE FUNCTION enforce_ticket_allocation_binding()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  purchase_row RECORD;
BEGIN
  SELECT p."drawId", p."requestedTicketCount"
  INTO purchase_row
  FROM "purchases" AS p
  WHERE p."id" = NEW."purchaseId";

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ticket allocation purchase does not exist'
      USING ERRCODE = '23514';
  END IF;

  IF NEW."drawId" IS DISTINCT FROM purchase_row."drawId" THEN
    RAISE EXCEPTION 'Ticket allocation draw must match its purchase'
      USING ERRCODE = '23514';
  END IF;

  IF
    NEW."startNumber" <= 0
    OR NEW."endNumber" < NEW."startNumber"
    OR (NEW."endNumber" - NEW."startNumber" + 1) <> purchase_row."requestedTicketCount"
  THEN
    RAISE EXCEPTION 'Ticket allocation range must exactly match requested ticket count'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ticket_allocations_enforce_binding ON "ticket_allocations";
CREATE TRIGGER ticket_allocations_enforce_binding
BEFORE INSERT OR UPDATE ON "ticket_allocations"
FOR EACH ROW
EXECUTE FUNCTION enforce_ticket_allocation_binding();

CREATE OR REPLACE FUNCTION enforce_ticket_issuance_binding()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  allocation_row RECORD;
BEGIN
  SELECT a."startNumber", a."endNumber"
  INTO allocation_row
  FROM "ticket_allocations" AS a
  WHERE a."purchaseId" = NEW."purchaseId"
    AND a."drawId" = NEW."drawId";

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ticket requires a reserved purchase allocation'
      USING ERRCODE = '23514';
  END IF;

  IF NEW."numberInDraw" < allocation_row."startNumber"
     OR NEW."numberInDraw" > allocation_row."endNumber"
  THEN
    RAISE EXCEPTION 'Ticket number is outside its reserved allocation'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tickets_enforce_issuance_binding ON "tickets";
CREATE TRIGGER tickets_enforce_issuance_binding
BEFORE INSERT ON "tickets"
FOR EACH ROW
EXECUTE FUNCTION enforce_ticket_issuance_binding();
