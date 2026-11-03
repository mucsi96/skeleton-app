use sqlx::{ConnectOptions, PgPool};
use std::process::Command;

#[sqlx::test(migrations = false)]
async fn loco_cli_bootstraps_the_app_schema_from_environment_configuration(pool: PgPool) {
    for environment in ["development", "test"] {
        let output = Command::new(env!("CARGO_BIN_EXE_skeleton-server"))
            .args(["db", "migrate"])
            .env("LOCO_ENV", environment)
            .env(
                "DATABASE_URL",
                pool.connect_options().to_url_lossy().as_str(),
            )
            .env("OIDC_ISSUER", "http://localhost:8050/default")
            .env("API_CLIENT_ID", "fixture-audience")
            .env("ANTHROPIC_BASE_URL", "http://localhost:3050")
            .env("ANTHROPIC_API_KEY", "fixture-key")
            .output()
            .unwrap();
        assert!(
            output.status.success(),
            "Loco migration failed: {}",
            String::from_utf8_lossy(&output.stderr)
        );
    }
    let greetings: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM hello.greetings")
        .fetch_one(&pool)
        .await
        .unwrap();
    let migrations: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM hello.seaql_migrations")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(greetings, 1);
    assert_eq!(migrations, 1);
}
