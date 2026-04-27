# Skeleton App

Reference application for all future projects. Based on patterns from [learn-language](https://github.com/mucsi96/learn-language).

## Patterns Covered

- **CI/CD Pipeline** - GitHub Actions with E2E testing and image publishing
- **Deployment** - Docker multi-stage builds with Traefik reverse proxy
- **Client** - Angular 21 with Material UI dark theme
- **Server** - Spring Boot 4 with Java 21
- **Authentication** - Azure AD (MSAL) with conditional mock auth for testing
- **Configuration** - Azure Key Vault + Spring profiles (prod/local/test)
- **AI Integration** - Anthropic Claude via Spring AI
- **AI Mocking** - Express mock server for testing
- **Database** - PostgreSQL with Spring Data JPA
- **Testing** - Playwright E2E tests
- **UI Components** - Material UI with custom dark theme
- **Fetching** - Angular resource API with HttpClient

## AI Pattern Sync

This repository publishes a diff of the last 2 weeks of changes to GitHub Pages. AI agents on other projects can fetch this diff to stay in sync with the latest patterns from skeleton-app.

- **Commits**: `https://mucsi96.github.io/skeleton-app/commits.txt`
- **Diff**: `https://mucsi96.github.io/skeleton-app/diff.patch`

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
| 8080 | Spring Boot server   | Test pod (internal, behind Traefik) |
| 8150 | Traefik (web)        | Test pod                            |
| 8151 | Traefik (admin)      | Test pod                            |
| 8152 | Spring Actuator      | Local dev & test                    |

## Quick Start

```bash
# Start test stack
scripts/compose_up.sh

# Run E2E tests
cd test && npm test
```
