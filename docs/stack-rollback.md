# Restore Angular and Spring Boot

The owner requested this rollback on 2026-11-09 because of visual regressions
and because Rust is not the target backend language.

Reverse PRs #122, #120, #118, #117, #116 and #115, restoring the application,
build, tests and deployment from `ea65636`, retaining the later removal of
static-asset browser tests. Angular and Spring Boot/GraalVM are
the reference stack again. Gateway authentication and Azure static hosting stay.

The Rust baseline adopted `hello.greetings` without changing existing rows or
Liquibase history. Deploy the restored application against the existing database;
do not run SeaORM down migrations or restore an old database snapshot. Existing
SeaORM metadata can remain unused. A database first created by Rust, without the
old Liquibase history, needs separate adoption work before using this release.

The rollback is an ordinary forward commit and publishes new numbered releases.
CI must validate native builds and Playwright before merge. Production checks
include authenticated greeting/AI rendering, deep links and static asset loading.
