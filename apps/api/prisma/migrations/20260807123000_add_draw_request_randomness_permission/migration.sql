INSERT INTO "permissions" (
  "id",
  "code",
  "description"
)
VALUES (
  '00000000-0000-4000-8000-000000000211',
  'draw.request_randomness',
  'Request and verify signed randomness evidence for a finalized lottery draw'
)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "role_permissions" (
  "roleId",
  "permissionId"
)
SELECT
  role_row."id",
  permission_row."id"
FROM "roles" AS role_row
CROSS JOIN "permissions" AS permission_row
WHERE role_row."code" = 'DRAW_OPERATOR'
  AND permission_row."code" = 'draw.request_randomness'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
