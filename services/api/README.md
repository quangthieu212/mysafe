# Két Sắt Việt API v2 foundation

This standalone NestJS service runs beside the existing Next.js prototype. The
v2 API contract is in `../../contracts/openapi.yaml`; the current Next.js API
continues to serve existing clients while v2 routes are implemented.

## Local PostgreSQL and checks

Requires Node.js 24.15+ and Docker Compose. The Compose database is for local
development only and uses a disposable development credential.

```powershell
docker compose -f services/api/compose.yaml up -d postgres
$env:DATABASE_URL = 'postgresql://postgres:ksv-local-dev-only@localhost:5433/ksv_dev'
$env:MIGRATION_DATABASE_URL = $env:DATABASE_URL
$env:TEST_DATABASE_URL = $env:DATABASE_URL
npm ci --prefix services/api --ignore-scripts
npm run migrate --prefix services/api
npm run check --prefix services/api
npm run start:dev --prefix services/api
```

The service listens on `http://127.0.0.1:7020/api/v2`. Liveness and readiness
probes are available at `/health/live` and `/health/ready`.

## Database credentials

`MIGRATION_DATABASE_URL` is a privileged, short-lived migration connection.
`DATABASE_URL` is the application connection; each user transaction switches
to the non-login `ksv_app` role and sets the authenticated `app.user_id` with
transaction-local scope. The application login must be granted membership in
`ksv_app` by a separate provisioning step. Never use the local Compose
superuser URL as a production application credential.

The `userId` passed to the transaction helper must come from a verified server
authentication context. PostgreSQL custom settings are context labels, not
credentials; never populate `app.user_id` from client-controlled data. Production
login roles must not own these tables or have `BYPASSRLS`.

The current migration implements only users, vaults, encrypted item envelopes,
and idempotency records. It does not implement authentication, OPAQUE, account
registration, the rest of the v2 schema, or vault HTTP endpoints. No production
data should be connected to this foundation before those parts are reviewed.
