use std::time::Duration;

use skeleton_server::{AppState, auth::Auth, config::Config};
use sqlx::postgres::PgPoolOptions;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    if std::env::args().any(|arg| arg == "--version") {
        println!("skeleton-server {}", env!("CARGO_PKG_VERSION"));
        return Ok(());
    }
    rustls::crypto::ring::default_provider()
        .install_default()
        .expect("install TLS provider");
    // Podman translates HTTP probes to an in-container curl shell command.
    // Keep the distroless image shell-free by offering a native probe command.
    if std::env::args().any(|arg| arg == "--healthcheck") {
        let mut address: std::net::SocketAddr = std::env::var("LISTEN_ADDR")
            .unwrap_or_else(|_| "0.0.0.0:8080".into())
            .parse()?;
        if address.ip().is_unspecified() {
            address.set_ip(if address.is_ipv4() {
                std::net::Ipv4Addr::LOCALHOST.into()
            } else {
                std::net::Ipv6Addr::LOCALHOST.into()
            });
        }
        reqwest::Client::builder()
            .timeout(Duration::from_secs(5))
            .build()?
            .get(format!("http://{address}/healthz"))
            .send()
            .await?
            .error_for_status()?;
        return Ok(());
    }
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()),
        )
        .init();
    let config = Config::load().await?;
    let database = PgPoolOptions::new()
        .max_connections(5)
        .acquire_timeout(Duration::from_secs(60))
        .connect_with(config.database)
        .await?;
    // Keep migration metadata in the application's schema, as Liquibase did;
    // the production role need not have CREATE permission on public.
    sqlx::query("CREATE SCHEMA IF NOT EXISTS hello")
        .execute(&database)
        .await?;
    skeleton_server::MIGRATOR.run(&database).await?;
    // The local pod starts its issuer concurrently. Retry discovery for a bounded
    // startup window; invalid/unavailable configuration still terminates startup.
    let auth = {
        let mut attempts = 0;
        loop {
            match Auth::new(config.issuer.clone(), config.audience.clone()).await {
                Ok(auth) => break auth,
                Err(error) if attempts < 10 => {
                    tracing::warn!(%error, "waiting for OIDC discovery");
                    attempts += 1;
                    tokio::time::sleep(Duration::from_secs(2)).await;
                }
                Err(error) => return Err(error),
            }
        }
    };
    let app = skeleton_server::router(
        AppState {
            database,
            client: skeleton_server::http_client()?,
            anthropic_url: config.anthropic_url,
            anthropic_key: config.anthropic_key,
        },
        auth,
    );
    let listener = tokio::net::TcpListener::bind(&config.listen).await?;
    tracing::info!(address = %config.listen, "server ready");
    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown())
        .await?;
    Ok(())
}

async fn shutdown() {
    let mut terminate = tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
        .expect("install SIGTERM handler");
    tokio::select! { _ = tokio::signal::ctrl_c() => {}, _ = terminate.recv() => {} }
}
