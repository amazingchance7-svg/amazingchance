INSERT INTO "permissions" ("id", "code", "description")
VALUES
  (
    '00000000-0000-4000-8000-000000000301',
    'user.read.admin',
    'Read non-secret user account metadata for administrative operations'
  ),
  (
    '00000000-0000-4000-8000-000000000302',
    'purchase.read.admin',
    'Read purchases across users for administrative operations'
  ),
  (
    '00000000-0000-4000-8000-000000000303',
    'ticket.read.admin',
    'Read issued tickets across users for administrative operations'
  ),
  (
    '00000000-0000-4000-8000-000000000304',
    'finance.read.admin',
    'Read aggregate operational and financial metrics'
  )
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT
  role_row."id",
  permission_row."id"
FROM "roles" AS role_row
CROSS JOIN "permissions" AS permission_row
WHERE role_row."code" = 'PLATFORM_ADMIN'
  AND permission_row."code" IN (
    'user.read.admin',
    'purchase.read.admin',
    'ticket.read.admin',
    'finance.read.admin'
  )
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
