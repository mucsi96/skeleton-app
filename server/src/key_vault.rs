use anyhow::{Context, ensure};
use azure_identity::WorkloadIdentityCredential;
use azure_security_keyvault_secrets::SecretClient;
use loco_rs::config::Config;
use url::Url;

use crate::settings::Settings;

pub async fn configure(config: &mut Config) -> anyhow::Result<()> {
    let endpoint =
        std::env::var("AZURE_KEYVAULT_ENDPOINT").context("AZURE_KEYVAULT_ENDPOINT is required")?;
    let client = SecretClient::new(&endpoint, WorkloadIdentityCredential::new(None)?, None)?;
    config.database.uri = database_uri(
        &secret(&client, "db-url").await?,
        &secret(&client, "db-username").await?,
        &secret(&client, "db-password").await?,
    )?;
    let mut settings: Settings = config.settings()?;
    settings.oidc.issuer = format!(
        "https://login.microsoftonline.com/{}/v2.0",
        secret(&client, "tenant-id").await?
    );
    settings.oidc.audience = secret(&client, "api-client-id").await?;
    settings.anthropic.api_key = secret(&client, "claude-api-key").await?;
    config.settings = Some(serde_json::to_value(settings)?);
    Ok(())
}

async fn secret(client: &SecretClient, name: &str) -> anyhow::Result<String> {
    let value = client
        .get_secret(name, None)
        .await?
        .into_model()?
        .value
        .with_context(|| format!("Key Vault secret {name} is empty"))?;
    ensure!(!value.trim().is_empty(), "Key Vault secret {name} is empty");
    Ok(value)
}

pub fn database_uri(value: &str, username: &str, password: &str) -> anyhow::Result<String> {
    // Key Vault owns the connection contract, including separate credentials.
    let mut url = Url::parse(value.strip_prefix("jdbc:").unwrap_or(value))?;
    ensure!(
        matches!(url.scheme(), "postgres" | "postgresql"),
        "PostgreSQL URL required"
    );
    // URL setters encode delimiters but preserve percent signs; escape those
    // first so literal percent-encoded-looking credentials round-trip intact.
    url.set_username(&username.replace('%', "%25"))
        .map_err(|_| anyhow::anyhow!("Invalid database username"))?;
    url.set_password(Some(&password.replace('%', "%25")))
        .map_err(|_| anyhow::anyhow!("Invalid database password"))?;
    Ok(url.into())
}
