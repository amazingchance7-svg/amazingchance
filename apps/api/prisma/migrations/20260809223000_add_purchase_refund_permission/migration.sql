INSERT INTO "permissions" ("id", "code", "description")
VALUES
  (
    '00000000-0000-4000-8000-000000000307',
    'purchase.refund.admin',
    'Request a full Stripe refund for an eligible completed purchase'
  )
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT
  role_row."id",
  permission_row."id"
FROM "roles" AS role_row
CROSS JOIN "permissions" AS permission_row
WHERE role_row."code" = 'PLATFORM_ADMIN'
  AND permission_row."code" = 'purchase.refund.admin'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
