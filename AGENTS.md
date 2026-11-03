# Skeleton App - Development Guidelines

## Code Review Rules

- Review the PR diff for actionable correctness, security, data-loss, and deployment regressions; cite the changed file/line and concrete impact.
- Preserve authentication boundaries, persisted data compatibility, and the project's documented build/test/deploy contracts. Adapt shared patterns to this project's stack.
- Report missing behavioral coverage where it would catch a specific regression; leave formatting and mechanical checks to CI.

## Codex automation

Use native Codex GitHub reviews and `@codex` PR tasks with ChatGPT sign-in.
Setup: https://github.com/mucsi96/skeleton-app/blob/main/docs/codex-automation.md
This repository is the skeleton-sync source; it does not synchronize from itself.

## General Code Style

- Avoid fallbacks, prefer failing fast.
- Prefer functional programming patterns and immutable data structures.
- Rust: Axum handlers, typed Serde payloads, SQLx parameterized queries, Tokio async I/O,
  `Result` error propagation, and structured tracing. Never expose internal errors or secrets in API responses.
- TypeScript: strict types, `const`, functional array methods, string literals over enums.
- React: function components, hooks, TanStack Query for server state, Zod validation at API boundaries.
- Use `@mucsi96/react-ui` components and its documented APIs, matching Observatory.
- Dark theme, accessible semantic controls, skeleton loading states, actionable error states.
- Tests should describe user behavior. Use Playwright role/text/label selectors.

## Architecture

- **client/** — React 19 + Vite static SPA, shared React UI, build-time Faro configuration.
- **server/** — Rust 2024, Axum/Tokio, SQLx/PostgreSQL, Anthropic Messages API.
- **mock_anthropic_server/** — Express mock for Claude API.
- **test/** — Playwright E2E, gateway identity fixtures, Podman test pod.
- **scripts/** — Build and deployment scripts.
- **.github/workflows/** — CI/CD pipelines.

Toolchain versions are pinned in `server/rust-toolchain.toml` and lockfiles.

## Development and checks

```bash
scripts/install_dependencies.sh
scripts/pod_up.sh
cd test && npm test
cd client && npm run lint && npm run build
cd server && cargo fmt --check && cargo clippy --locked --all-targets -- -D warnings
# Requires a PostgreSQL user with CREATE DATABASE permission (isolated test databases):
cd server && DATABASE_URL=postgres://postgres:postgres@localhost:5451/test cargo test --locked
node --test scripts/prepare-client.test.mjs
python3 scripts/check_static_assets.py client/dist
```

`npm start` in client starts Vite on 4250. `cargo run --locked` in server runs the
API; see README for required environment variables. `scripts/dev_db_up.sh` starts
the standalone development database. Podman is a distro-level prerequisite; the
Nix shell supplies Rust/Node and deployment tools.

## Data and configuration

- `GET /api/greeting` returns `{name,message,aiGreeting}` and requires a valid JWT,
  `api-access` scope, and `readGreetings` role.
- Preserve `hello.greetings` and its existing sequence. SQLx migrations adopt the
  Liquibase-created table and leave legacy changelog tables intact. Seed only new
  databases; never overwrite or reseed existing user data.
- `APP_ENV=prod` loads existing `db-url`, `db-username`, `db-password`, `tenant-id`,
  `api-client-id`, and `claude-api-key` secrets from `AZURE_KEYVAULT_ENDPOINT` using
  Azure workload identity. JDBC PostgreSQL URLs remain accepted.
- `APP_ENV=local|test` requires explicit DB/OIDC/Anthropic environment values.
- One native Rust image supports all environments at runtime. No build profiles,
  JVM, AOT processing, reflection hints, or secrets in the image.
- `/healthz` reports readiness after migration/discovery and checks database access.

## Authentication and static hosting

- The platform owns oauth2-proxy, login configuration, and HttpOnly sessions. The
  client chart owns authenticated SPA documents and index URL rewriting; the API
  chart owns API auth/header policies.
- Validate JWT signature, issuer, audience, expiry/not-before, scope, and role in
  the API even when requests arrive through ForwardAuth.
- Keep CSRF checks active on all unsafe requests, including proxy-injected bearer
  requests. Use Secure, host-only `__Host-XSRF-TOKEN` at `/` and require its matching
  `X-XSRF-TOKEN` header. The same-origin fetch helper sends CSRF proof on mutations.
- No frontend OAuth service, auth interceptor, guard, or sign-in/out UI. Userinfo
  is read-only profile data. E2E fixtures mock gateway identity; do not duplicate
  platform oauth2-proxy/Redis session-flow tests.
- Compile Faro's public app name and `/_telemetry/collect` path into the bundle;
  resolve against the browser's application origin, not the Blob asset origin.
- Bootstrap directly without global config, HTML markers, an environment endpoint,
  or config fetch. Omit chart `runtimeConfig` and retain `--reset-values`.
- Faro's same-origin logging route has credential stripping and collector
  origin/rate-limit controls.
- Build with Node/npm. Upload the tested `client/dist` artifact to Azure Storage
  with official `azure/login` / `azure/cli` actions; index is uploaded last.
- `prepare-client.mjs` rewrites HTML asset URLs only. Vite uses relative imports
  so modules, lazy chunks, CSS, fonts, icons, and manifests load directly from Blob
  storage with anonymous CORS. Document base remains `/`.
- Deploy reads `forward-auth-config.auth` for both charts. Pass the hostname in
  `client-storage-config` to `static-client-app.staticOrigin`. Production has no
  client Deployment or probes. Do not pass generated policy lists.
- E2E mounts `client/dist` into stock nginx behind Traefik. See docs/static-hosting.md.

## Release and image publishing

`publish-server` publishes numbered GHCR images only when
`get_next_version.outputs.hasNextVersion == 'true'`, using its `version` output.
Use job-scoped `packages: write` and `GITHUB_TOKEN`. Release tags target
`${{ github.sha }}`. Forward the action's version output directly to deployment;
do not add a consumer-side tag lookup. The workflow serializes publication/rollout.
Require numbered GHCR tags or digests, the GHCR source label, and a public server
package for anonymous pulls. Use `rust-app` for the API while preserving the
`hello-server` release, workload identity, `/api` route and existing database.
`publish-client` attaches the tested static archive to numbered client releases.
