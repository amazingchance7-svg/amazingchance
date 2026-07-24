# Amazing Chance

Transparent lottery platform. The repository now contains the first runnable development foundation.

## Requirements

- Node.js 24+
- pnpm 10+
- Docker Desktop

## Local setup

```bash
cp .env.example .env
docker compose up -d
pnpm install
pnpm db:generate
pnpm db:migrate
pnpm dev
```

Open:

- Web: http://localhost:3000
- API health: http://localhost:3001/health
- Prisma Studio: `pnpm db:studio`

## Current implementation

- Next.js web application
- NestJS API
- PostgreSQL and Redis via Docker Compose
- Prisma schema with initial `User` model
- API health endpoint
- GitHub Actions build/type-check workflow

## Next milestone

Implement user registration with password hashing, email normalization, duplicate prevention, immutable audit event, and integration tests.
