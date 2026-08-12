import {
  Module,
} from '@nestjs/common';

import {
  AuditModule,
} from '../audit/audit.module';
import {
  AuthorizationModule,
} from '../authorization/authorization.module';
import {
  AuthModule,
} from '../auth/auth.module';
import {
  PrismaModule,
} from '../prisma/prisma.module';
import {
  AdminPrizeClaimsController,
} from './admin-prize-claims.controller';
import {
  PrizeClaimsController,
} from './prize-claims.controller';
import {
  PrizeClaimsService,
} from './prize-claims.service';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    AuthorizationModule,
    AuditModule,
  ],
  controllers: [
    PrizeClaimsController,
    AdminPrizeClaimsController,
  ],
  providers: [
    PrizeClaimsService,
  ],
  exports: [
    PrizeClaimsService,
  ],
})
export class PrizeClaimsModule {}
