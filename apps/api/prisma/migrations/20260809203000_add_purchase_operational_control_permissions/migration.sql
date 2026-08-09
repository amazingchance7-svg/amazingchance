INSERT INTO "permissions" ("id", "code", "description")
VALUES
  (
    '00000000-0000-4000-8000-000000000305',
    'purchase.review.admin',
    'Move eligible unpaid purchases into manual review'
  ),
  (
    '00000000-0000-4000-8000-000000000306',
    'purchase.cancel.admin',
    'Cancel eligible unpaid purchases from manual review'
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
    'purchase.review.admin',
    'purchase.cancel.admin'
  )
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
