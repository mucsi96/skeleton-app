# Skeleton App - Development Guidelines

## General Code Style

- Avoid fallbacks, prefer failing fast
- Prefer functional programming patterns
- Prefer immutable data structures

## Java Style

- Use Lombok annotations (@Data, @Builder, @RequiredArgsConstructor)
- Constructor injection (via @RequiredArgsConstructor)
- Use Stream API for collections
- Use records for DTOs/responses

## TypeScript Style

- Use `const` by default
- Prefer spread operator for object/array operations
- Use functional array methods (map, filter, reduce)
- Use string literals over enums

## Testing Style

- Write tests from user perspective
- Use role-based selectors (getByRole)
- Use semantic selectors (getByText, getByLabel)
- E2E tests with Playwright

## Angular Style

- Use Angular Material components
- Use signals and resources (not rxjs where possible)
- Use string literals over enums
- Standalone components

## Design

- Material UI dark theme
- Skeleton loaders for loading states

## Project Overview

Reference application demonstrating patterns for:
- CI/CD pipeline (GitHub Actions)
- Deployment (Docker images published to registry)
- Client (Angular 21 with Material UI)
- Server (Spring Boot 4 with Java 21)
- Authentication (passwordless email magic links + email allowlist, HTTP session cookies)
- Configuration (Azure Key Vault, Spring profiles)
- AI integration (Anthropic Claude via Spring AI)
- AI mocking (Express mock server)
- Email mocking (Express mock email server)
- Database (PostgreSQL with JPA)
- Testing (Playwright E2E)

## Architecture

- **client/** - Angular 21 SPA with Material UI, magic-link authentication
- **server/** - Spring Boot 4 REST API with PostgreSQL, Spring AI
- **mock_anthropic_server/** - Express mock for Claude API
- **mock_email_server/** - Express mock email server capturing magic-link emails for tests
- **test/** - Playwright E2E tests
- **scripts/** - Build and deployment scripts
- **.github/workflows/** - CI/CD pipelines

## Key Technologies

- Spring Boot 4.0.3, Java 21
- Angular 21.2.0
- PostgreSQL 17
- Spring AI 2.0.0-M2 (Anthropic)
- Spring Security with email magic-link authentication (HTTP session cookies)
- Azure Key Vault for secrets
- Traefik reverse proxy
- Docker multi-stage builds
- Playwright for E2E testing

## Development Commands

### Frontend
```bash
cd client && npm start        # Start dev server
cd client && npm run build    # Production build
```

### Backend
```bash
cd server && mvn spring-boot:run -Dspring-boot.run.profiles=local  # Start with local profile
```

### Podman Development
```bash
scripts/pod_up.sh             # Build images and start test pod
scripts/pod_down.sh           # Stop and clean up test pod
scripts/dev_db_up.sh          # Start development PostgreSQL database
scripts/dev_db_down.sh        # Stop development database
```

### Testing
```bash
cd test && npm test           # Run E2E tests
cd test && npx playwright test --ui  # Interactive test runner
```

## API Routes

- `POST /api/auth/request-link` - Request a magic-link email for an allowlisted address (public; always responds 200)
- `POST /api/auth/verify` - Verify a magic-link token and establish a session (public)
- `GET /api/auth/me` - Current authenticated user (401 when unauthenticated)
- `POST /api/auth/logout` - Invalidate the session
- `GET /api/greeting` - AI-powered greeting (authenticated)

## Data Model

- **greetings** - Stores name and message used for AI greeting generation
- **auth_tokens** - One-time magic-link tokens (token, email, expiry, used flag)

## Authentication

Passwordless, magic-link based:
1. Client `POST /api/auth/request-link` with an email.
2. If the email is on the `app.allowed-emails` allowlist, the server stores a one-time token and emails a link (`{app.base-url}/auth/verify?token=...`). The response is uniform regardless of allowlist membership.
3. The client `auth/verify` route posts the token to `POST /api/auth/verify`, which establishes a Spring Security session (HTTP session cookie).
4. Subsequent `/api` requests are authenticated via the session cookie.

Email delivery strategy is selected by `app.email.provider`: `smtp` (prod), `mock` (test, posts to the mock email server) or `log` (local dev, logs the link).

## Configuration Patterns

### Spring Profiles
- **prod** - Production with Azure Key Vault, SMTP email, and a secure session cookie
- **local** - Local development with Podman DB, magic links logged to the console
- **test** - Testing with the mock email server and a non-secure session cookie

### Email Allowlist
- `app.allowed-emails` - emails permitted to authenticate (YAML list or comma-separated env var)
- `app.base-url` - public client URL used to build magic links
- `app.magic-link-validity` - token lifetime (default 15 minutes)
