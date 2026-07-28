# Amazing Chance

Amazing Chance is an online lottery platform built as a TypeScript monorepo.

## MVP
- Ticket price: USD 1.00
- Weekly draw
- Allocation: 70% weekly prize pool, 20% company revenue, 10% annual prize fund
- Three weekly winners receive 50%, 30%, and 20%
- RANDOM.ORG is the approved randomness provider
- No internal customer wallet in MVP

## Stack
NestJS, Next.js, Prisma 7, PostgreSQL, Redis, Docker Compose, pnpm.

## Local development
```bash
docker compose up -d
pnpm install
```
Current local endpoints:
- Web: `http://localhost:3000`
- API: `http://localhost:3001`
- Health: `http://localhost:3001/health`

## Documentation
- [Product](docs/01-PRODUCT.md)
- [Architecture](docs/02-ARCHITECTURE.md)
- [Database](docs/03-DATABASE.md)
- [Roadmap](docs/10-ROADMAP.md)
- [Architecture decisions](docs/ADR/)

AI agents must read [AGENTS.md](AGENTS.md) before changing the repository.
