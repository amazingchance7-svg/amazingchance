-- SEC-003
-- Separate business ownership, platform operations, and cryptographic draw execution.
-- Human roles must not manually open/close sales after SEC-002 automatic rollover.

INSERT INTO "roles" (
  "id",
  "code",
  "name",
  "description",
  "isSystem",
  "updatedAt"
)
VALUES (
  '00000000-0000-4000-8000-000000000104',
  'BUSINESS_OWNER',
  'Business Owner',
  'Business governance, financial oversight, draw configuration, publication, and approved refunds without cryptographic draw execution',
  true,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("code") DO UPDATE
SET
  "name" = EXCLUDED."name",
  "description" = EXCLUDED."description",
  "isSystem" = true,
  "updatedAt" = CURRENT_TIMESTAMP;

-- Replace grants for privileged human roles with an exact least-privilege matrix.
DELETE FROM "role_permissions"
WHERE "roleId" IN (
  SELECT "id"
  FROM "roles"
  WHERE "code" IN (
    'BUSINESS_OWNER',
    'PLATFORM_ADMIN',
    'DRAW_OPERATOR'
  )
);

-- BUSINESS_OWNER:
-- business configuration, financial visibility, publication, and refunds.
INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT role_row."id", permission_row."id"
FROM "roles" AS role_row
CROSS JOIN "permissions" AS permission_row
WHERE role_row."code" = 'BUSINESS_OWNER'
  AND permission_row."code" IN (
    'draw.read.admin',
    'draw.create',
    'draw.update',
    'draw.cancel',
    'draw.publish',
    'purchase.read.admin',
    'ticket.read.admin',
    'finance.read.admin',
    'purchase.refund.admin'
  )
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

-- PLATFORM_ADMIN:
-- technical/operational support only. No financial approval and no draw mutation.
INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT role_row."id", permission_row."id"
FROM "roles" AS role_row
CROSS JOIN "permissions" AS permission_row
WHERE role_row."code" = 'PLATFORM_ADMIN'
  AND permission_row."code" IN (
    'draw.read.admin',
    'user.read.admin',
    'purchase.read.admin',
    'ticket.read.admin',
    'purchase.review.admin',
    'purchase.cancel.admin'
  )
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

-- DRAW_OPERATOR:
-- deterministic/cryptographic draw execution only.
INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT role_row."id", permission_row."id"
FROM "roles" AS role_row
CROSS JOIN "permissions" AS permission_row
WHERE role_row."code" = 'DRAW_OPERATOR'
  AND permission_row."code" IN (
    'draw.read.admin',
    'draw.build_snapshot',
    'draw.finalize_snapshot',
    'draw.request_randomness',
    'draw.select_winners'
  )
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
