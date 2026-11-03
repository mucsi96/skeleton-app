# Skeleton App

Reference application for future projects, aligned with the Rust/React stack in
[Observatory](https://github.com/mucsi96/observatory-app).

## Stack

- **API:** Rust 2024, Axum, Tokio, SQLx/PostgreSQL, Serde, structured tracing.
- **Client:** React 19, Vite, TypeScript, TanStack Query, Zod, `@mucsi96/react-ui`.
- **AI:** Anthropic Messages API (`claude-sonnet-4-6`), Express mock for E2E.
- **Authentication:** platform oauth2-proxy/Entra, HttpOnly sessions, backend JWT validation.
- **Configuration:** Azure Key Vault via workload identity in production.
- **Delivery:** GitHub Actions, native Rust container, Azure Blob static assets,
  chart-owned authenticated Gateway documents and API routes.
- **Testing:** Rust security/database regression tests and Playwright browser tests.

## Quick start

Install Podman separately (on WSL enable systemd). The Nix dev shell supplies
Rustup, Node and deployment tools; Rust is pinned in `server/rust-toolchain.toml`.

```bash
nix develop
scripts/install_dependencies.sh
scripts/pod_up.sh
cd test && npm test
```

The pod includes PostgreSQL, the Rust API, mock OIDC/Anthropic services, nginx and
Traefik. Playwright supplies gateway identity/profile fixtures; the API still
verifies real mock-issued JWTs. Visit `http://localhost:8150` through those fixtures
for authenticated data. No local oauth2-proxy/Redis stack is required.

For a local Rust process, start the test pod for mock services, then:

```bash
scripts/dev_db_up.sh
cd server
APP_ENV=local LISTEN_ADDR=127.0.0.1:8053 \
DB_URL=postgres://localhost:5450/skeleton DB_USERNAME=postgres DB_PASSWORD=postgres \
OIDC_ISSUER=http://localhost:8050/default API_CLIENT_ID=mock-api-client-id \
ANTHROPIC_API_KEY=mock-anthropic-key ANTHROPIC_BASE_URL=http://localhost:3050 \
cargo run --locked
```

`cd client && npm start` runs Vite on 4250 with `/api` proxied to 8053. A direct
development browser still needs gateway identity; it does not bypass backend auth.
VS Code includes a Rust debug launch with the same local configuration.

## Checks

```bash
cd client && npm run lint && npm run build
cd server && cargo fmt --check && cargo clippy --locked --all-targets -- -D warnings
cd server && DATABASE_URL=postgres://postgres:postgres@localhost:5451/test cargo test --locked
cd test && npm test
node --test scripts/prepare-client.test.mjs
python3 scripts/check_static_assets.py client/dist
```

Run each command from the repository root. Rust database tests require a user with
CREATE DATABASE permission and create isolated databases. They cover fresh installs,
adoption of existing Liquibase data/sequences, and existing empty tables. Security
tests use ephemeral RSA keys and OIDC discovery to check JWT claims and CSRF.

## API, data and security

`GET /api/greeting` reads the first row (by ID) of `hello.greetings`, requests a
short greeting from Anthropic and returns `{name,message,aiGreeting}`. JWT validation
requires RS256, the configured issuer/audience, valid time claims, `api-access`
scope and `readGreetings` role. `/healthz` checks database access after startup
migrations and OIDC discovery have succeeded.

The initial API GET sets a readable Secure, host-only `__Host-XSRF-TOKEN` cookie
at `/`, with SameSite=Lax. All unsafe API requests require matching `X-XSRF-TOKEN`
proof, including requests with proxy-injected bearer credentials. The client fetch
helper adds that proof only to same-origin mutations. OAuth tokens remain at the
gateway; there is no sign-in/out UI or frontend token storage. `/oauth2/userinfo`
only supplies the read-only profile menu.

SQLx migrations preserve the existing `hello.greetings` table, IDs, sequence and
Liquibase changelog. Only a new database is seeded. No export/reset is required.

## Runtime configuration and deployment

One native Rust image supports all environments; no build-time profile is needed:

```bash
podman build -t localhost/skeleton-app-server:test server
podman run --rm localhost/skeleton-app-server:test --version
```

`APP_ENV` must be `prod`, `local` or `test`. Local/test require the environment
variables shown above. Production uses `AZURE_KEYVAULT_ENDPOINT` and Azure workload
identity (injected tenant/client/token-file variables) to read the existing secrets:
`db-url`, `db-username`, `db-password`, `tenant-id`, `api-client-id`, `claude-api-key`.
JDBC PostgreSQL URLs remain accepted. Secrets are loaded at startup. `LISTEN_ADDR`
defaults to `0.0.0.0:8080`; `RUST_LOG` controls tracing verbosity.

Deployment upgrades the existing `hello-server` release to `rust-app` 7.0.0,
preserving workload identity, JWT configuration and `/api` routing. The server uses
a non-root distroless image and handles SIGTERM gracefully. Production Key Vault
access requires the existing workload identity federation and secret-read grants.

See [static client deployment](docs/static-hosting.md). The tested Vite artifact
is uploaded to Azure Storage; the `static-client-app` chart authenticates documents
before rewriting deep links to index. Public modules/styles/fonts/icons load from
Blob storage with anonymous CORS. API/profile/Faro requests stay on the application
origin. Faro settings are compiled into the bundle; there is no runtime config
marker, bootstrap fetch, or production client container. The logging route strips
credentials and enforces collector origin/rate-limit controls.

## Ports

| Port | Service |
|------|---------|
| 3050 | Mock Anthropic |
| 4250 | Vite dev server |
| 5450 | Development PostgreSQL |
| 5451 | Test PostgreSQL |
| 8050 | Mock OIDC |
| 8053 | Local Rust API |
| 8054 | Test Rust API (pod-internal) |
| 8150 | Test Traefik web |
| 8151 | Test Traefik admin |

## AI pattern sync

This repository publishes the last two weeks of changes to GitHub Pages on main
pushes, weekly, and on manual dispatch:

- [Commits](https://mucsi96.github.io/skeleton-app/commits.txt)
- [Diff](https://mucsi96.github.io/skeleton-app/diff.patch)
