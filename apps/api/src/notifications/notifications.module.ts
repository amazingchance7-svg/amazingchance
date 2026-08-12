import {
  Module,
} from '@nestjs/common';

import {
  EmailModule,
} from '../email/email.module';
import {
  PrismaModule,
} from '../prisma/prisma.module';
import {
  NotificationOutboxService,
} from './notification-outbox.service';

@Module({
  imports: [
    PrismaModule,
    EmailModule,
  ],
  providers: [
    NotificationOutboxService,
  ],
  exports: [
    NotificationOutboxService,
  ],
})
export class NotificationsModule {}
