# Skeleton App

Reference application for all future projects. Based on patterns from [learn-language](https://github.com/mucsi96/learn-language).

## Patterns Covered

- **CI/CD Pipeline** - GitHub Actions with E2E testing and image publishing
- **Deployment** - Docker multi-stage builds with Traefik reverse proxy
- **Client** - Angular 21 with Material UI dark theme
- **Server** - Spring Boot 4 with Java 21, compiled ahead of time into a GraalVM native image
- **Authentication** - Entra through stock oauth2-proxy ForwardAuth and HttpOnly sessions
- **Configuration** - Azure Key Vault + Spring profiles (prod/local/test)
- **AI Integration** - Anthropic Claude via Spring AI
- **AI Mocking** - Express mock server for testing
- **Database** - PostgreSQL with Spring Data JPA
- **Testing** - Playwright E2E tests
- **UI Components** - Material UI with custom dark theme
- **Fetching** - Angular resource API with HttpClient

## Authentication and deployment

Static HTML, bundles and SPA routes are public. Before Angular starts, the loader
requests `/api/environment` with the current relative URL as `returnTo`. The
environment controller checks the private proxy session and returns configuration
or a generic `redirectTo` instruction. The loader follows that instruction.
There is no frontend auth service, auth interceptor, route guard or login/logout
UI. A read-only `/oauth2/userinfo` resource supplies the header profile menu.

The API keeps JWT audience/scope/role validation and uses Spring Security's built-in
SPA CSRF protection for unsafe requests, including proxy-injected bearer requests.
The initial environment call sets a Secure, host-only `__Host-XSRF-TOKEN` cookie at
`/`; Angular's built-in XSRF support sends its value as `X-XSRF-TOKEN` on same-origin
mutations. This is a CSRF token, not an OAuth credential. There is no custom filter
or auth interceptor, and no backend `BROWSER_ORIGIN` setting is needed.

Platform Terraform owns `hello-oauth2-proxy` and its Secrets. Publish the shared
ForwardAuth/app chart changes and provision that release before deploying this
app. `scripts/deploy.sh` fails early if the auth release or middleware-capable
charts are missing. It supplies the production origin and reads standard
API route filters from `forward-auth-config` in the app Azure Key Vault. That
configuration also supplies the auth release name, `session_url` and `sign_in_url`;
the last two become backend `AUTH_SESSION_URL` and `AUTH_SIGN_IN_URL` variables.
Only the API receives auth filters. The client upgrade resets old values to
remove previous frontend filters. The proxy owns OAuth and session renewal; an
unrenewable session re-enters login on the next page load.

The app tests use mock authentication. Playwright injects a mock-issued bearer
token into browser API requests and supplies profile data. The existing mock
provider's health endpoint stands in for a valid bootstrap session. Backend JWT
validation and Spring CSRF checks stay enabled. Test pods run the app, database, mock OIDC/AI services
and routing, without oauth2-proxy or Redis. Playwright targets `http://localhost:8150`.

## One image per Spring profile

The server is shipped as a GraalVM native executable. Bean definitions are
resolved during ahead-of-time processing at build time, so the active Spring
profile is baked into the executable and cannot be chosen at startup any more.
The server image is therefore built once per profile, via the `SPRING_PROFILE`
build argument:

```bash
podman build --build-arg SPRING_PROFILE=test -t skeleton-app-server:test server   # e2e pod
podman build --build-arg SPRING_PROFILE=prod -t skeleton-app-server:prod server   # published image
```

`SPRING_PROFILES_ACTIVE` is not read at runtime; the pipeline builds the test
image for the e2e job and the prod image when publishing to GHCR. Running
the server on a JVM for local development is unaffected - `mvn spring-boot:run
-Dspring-boot.run.profiles=local` still selects the profile the usual way.

## AI Pattern Sync

This repository publishes a diff of the last 2 weeks of changes to GitHub Pages. AI agents on other projects can fetch this diff to stay in sync with the latest patterns from skeleton-app.

- **Commits**: `https://mucsi96.github.io/skeleton-app/commits.txt`
- **Diff**: `https://mucsi96.github.io/skeleton-app/diff.patch` (or `https://mucsi96.github.io/skeleton-app/diff.txt` to view inline in browser)

The pages build runs on every push to main, weekly on Monday, and on manual dispatch.

## Port Mapping

All host-exposed ports use the **xx50–xx59** range for their last two digits to avoid clashes with other local projects.

| Port | Service              | Context                             |
|------|----------------------|-------------------------------------|
| 3050 | Mock Anthropic API   | Test pod                            |
| 4250 | Angular dev server   | Local dev                           |
| 5450 | PostgreSQL           | Dev database                        |
| 5451 | PostgreSQL           | Test pod                            |
| 8050 | Mock OAuth2 provider | Test pod                            |
| 8053 | Spring Boot server   | Local dev (VSCode)                  |
| 8054 | Spring Boot server   | Test pod (internal, behind Traefik) |
| 8150 | Traefik (web)        | Test pod                            |
| 8151 | Traefik (admin)      | Test pod                            |
| 8152 | Spring Actuator      | Local dev & test                    |

## Development Environment

System tooling (JDK 21, Maven, Node, jq, kubectl, helm, azure-cli) is provided by
a Nix flake dev shell:

```bash
nix develop          # enter the dev shell manually
# or, with direnv installed, `direnv allow` once and it loads automatically
```

Then install the per-project dependencies:

```bash
scripts/install_dependencies.sh
```

**Podman** is a distro-level prerequisite and is not managed by the flake
(rootless Podman needs setuid `newuidmap`/`newgidmap` helpers the Nix store
cannot provide). On WSL, enable `systemd=true` in `/etc/wsl.conf` and install it
via your distro, e.g. `apt install podman`.

## Quick Start

```bash
# Start test stack
scripts/pod_up.sh

# Run E2E tests
cd test && npm test
```
