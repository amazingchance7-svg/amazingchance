import 'dotenv/config';
import {
  defineConfig,
  env,
} from 'prisma/config';

const migrationDatabaseUrl =
  process.env
    .MIGRATION_DATABASE_URL ??
  env('DATABASE_URL');

export default defineConfig({
  schema:
    'prisma/schema.prisma',
  migrations: {
    path:
      'prisma/migrations',
  },
  datasource: {
    url:
      migrationDatabaseUrl,
  },
});
