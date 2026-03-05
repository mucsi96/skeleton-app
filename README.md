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

## Quick Start

```bash
# Start test stack
scripts/compose_up.sh

# Run E2E tests
cd test && npm test
```
