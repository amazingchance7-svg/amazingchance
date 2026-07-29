# Amazing Chance — Auth refactor, phase 1

Copy the `apps` folder into the project root and confirm file replacement.

Then run from `C:\Projects\amazingchance`:

```powershell
pnpm --filter @amazing-chance/api typecheck
pnpm --filter @amazing-chance/api build
pnpm dev
```

Existing API routes must remain unchanged:
- POST /auth/register
- POST /auth/login
- POST /auth/refresh
- POST /auth/logout
- GET /auth/me

This phase moves JWT and refresh-token responsibilities from AuthService into TokenService.
Refresh-token rotation is now performed atomically in a Prisma transaction.
