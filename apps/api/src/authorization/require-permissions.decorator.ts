import { SetMetadata } from '@nestjs/common';

import { REQUIRED_PERMISSIONS_KEY } from './authorization.constants';
import { Permission } from './permission.type';

export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata(REQUIRED_PERMISSIONS_KEY, permissions);
