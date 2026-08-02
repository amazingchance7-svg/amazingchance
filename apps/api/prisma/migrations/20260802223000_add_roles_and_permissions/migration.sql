CREATE TABLE "roles" (
  "id" UUID NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "isSystem" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "permissions" (
  "id" UUID NOT NULL,
  "code" TEXT NOT NULL,
  "description" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "user_roles" (
  "userId" UUID NOT NULL,
  "roleId" UUID NOT NULL,
  "assignedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "assignedByUserId" UUID,
  CONSTRAINT "user_roles_pkey" PRIMARY KEY ("userId", "roleId")
);

CREATE TABLE "role_permissions" (
  "roleId" UUID NOT NULL,
  "permissionId" UUID NOT NULL,
  CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("roleId", "permissionId")
);

CREATE UNIQUE INDEX "roles_code_key" ON "roles"("code");
CREATE UNIQUE INDEX "permissions_code_key" ON "permissions"("code");
CREATE INDEX "user_roles_roleId_idx" ON "user_roles"("roleId");
CREATE INDEX "user_roles_assignedByUserId_idx" ON "user_roles"("assignedByUserId");
CREATE INDEX "role_permissions_permissionId_idx" ON "role_permissions"("permissionId");

ALTER TABLE "user_roles"
  ADD CONSTRAINT "user_roles_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "user_roles"
  ADD CONSTRAINT "user_roles_roleId_fkey"
  FOREIGN KEY ("roleId") REFERENCES "roles"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "user_roles"
  ADD CONSTRAINT "user_roles_assignedByUserId_fkey"
  FOREIGN KEY ("assignedByUserId") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "role_permissions"
  ADD CONSTRAINT "role_permissions_roleId_fkey"
  FOREIGN KEY ("roleId") REFERENCES "roles"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "role_permissions"
  ADD CONSTRAINT "role_permissions_permissionId_fkey"
  FOREIGN KEY ("permissionId") REFERENCES "permissions"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "roles" ("id", "code", "name", "description", "isSystem", "updatedAt") VALUES
  ('00000000-0000-4000-8000-000000000101', 'CUSTOMER', 'Customer', 'Standard customer account', true, CURRENT_TIMESTAMP),
  ('00000000-0000-4000-8000-000000000102', 'DRAW_OPERATOR', 'Draw Operator', 'Operates approved draw administration commands', true, CURRENT_TIMESTAMP),
  ('00000000-0000-4000-8000-000000000103', 'PLATFORM_ADMIN', 'Platform Administrator', 'Platform administration without ticket, snapshot, randomness, or winner override permissions', true, CURRENT_TIMESTAMP);

INSERT INTO "permissions" ("id", "code", "description") VALUES
  ('00000000-0000-4000-8000-000000000201', 'draw.read.admin', 'Read administrative draw details'),
  ('00000000-0000-4000-8000-000000000202', 'draw.create', 'Create a scheduled draw'),
  ('00000000-0000-4000-8000-000000000203', 'draw.update', 'Update mutable draw configuration'),
  ('00000000-0000-4000-8000-000000000204', 'draw.open_sales', 'Open ticket sales for a draw'),
  ('00000000-0000-4000-8000-000000000205', 'draw.close_sales', 'Close ticket sales for a draw'),
  ('00000000-0000-4000-8000-000000000206', 'draw.cancel', 'Cancel a draw through an approved command'),
  ('00000000-0000-4000-8000-000000000207', 'draw.publish', 'Publish a completed draw');

INSERT INTO "role_permissions" ("roleId", "permissionId") VALUES
  ('00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-000000000201'),
  ('00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-000000000202'),
  ('00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-000000000203'),
  ('00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-000000000204'),
  ('00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-000000000205'),
  ('00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-000000000206'),
  ('00000000-0000-4000-8000-000000000103', '00000000-0000-4000-8000-000000000201'),
  ('00000000-0000-4000-8000-000000000103', '00000000-0000-4000-8000-000000000202'),
  ('00000000-0000-4000-8000-000000000103', '00000000-0000-4000-8000-000000000203'),
  ('00000000-0000-4000-8000-000000000103', '00000000-0000-4000-8000-000000000204'),
  ('00000000-0000-4000-8000-000000000103', '00000000-0000-4000-8000-000000000205'),
  ('00000000-0000-4000-8000-000000000103', '00000000-0000-4000-8000-000000000206'),
  ('00000000-0000-4000-8000-000000000103', '00000000-0000-4000-8000-000000000207');
