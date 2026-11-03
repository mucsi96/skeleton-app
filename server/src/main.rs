use std::time::Duration;

use migration::Migrator;
use skeleton_server::app::App;

#[tokio::main]
async fn main() -> loco_rs::Result<()> {
    rustls::crypto::ring::default_provider()
        .install_default()
        .expect("install TLS provider");
    // Native Podman probe: distroless images have neither curl nor a shell.
    if std::env::args().any(|arg| arg == "--healthcheck") {
        let port = std::env::var("PORT").unwrap_or_else(|_| "8080".into());
        reqwest::Client::builder()
            .timeout(Duration::from_secs(5))
            .build()
            .map_err(loco_rs::Error::wrap)?
            .get(format!("http://127.0.0.1:{port}/healthz"))
            .send()
            .await
            .map_err(loco_rs::Error::wrap)?
            .error_for_status()
            .map_err(loco_rs::Error::wrap)?;
        return Ok(());
    }
    loco_rs::cli::main::<App, Migrator>().await
}
