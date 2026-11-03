use std::{env, str::FromStr};

use anyhow::{Context, ensure};
use azure_identity::WorkloadIdentityCredential;
use azure_security_keyvault_secrets::SecretClient;
use sqlx::postgres::PgConnectOptions;

pub struct Config {
    pub database: PgConnectOptions,
    pub issuer: String,
    pub audience: String,
    pub anthropic_key: String,
    pub anthropic_url: String,
    pub listen: String,
}

fn required(name: &str) -> anyhow::Result<String> {
    let value = env::var(name).with_context(|| format!("{name} is required"))?;
    ensure!(!value.trim().is_empty(), "{name} must not be empty");
    Ok(value)
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

impl Config {
    pub async fn load() -> anyhow::Result<Self> {
        // Explicit modes: production always uses workload identity, with no local
        // credential fallback. Keep the existing Key Vault names and JDBC URL.
        let (db_url, db_user, db_password, issuer, audience, anthropic_key, anthropic_url) =
            match required("APP_ENV")?.as_str() {
                "prod" => {
                    let client = SecretClient::new(
                        &required("AZURE_KEYVAULT_ENDPOINT")?,
                        WorkloadIdentityCredential::new(None)?,
                        None,
                    )?;
                    (
                        secret(&client, "db-url").await?,
                        secret(&client, "db-username").await?,
                        secret(&client, "db-password").await?,
                        format!(
                            "https://login.microsoftonline.com/{}/v2.0",
                            secret(&client, "tenant-id").await?
                        ),
                        secret(&client, "api-client-id").await?,
                        secret(&client, "claude-api-key").await?,
                        "https://api.anthropic.com".to_owned(),
                    )
                }
                "local" | "test" => (
                    required("DB_URL")?,
                    required("DB_USERNAME")?,
                    required("DB_PASSWORD")?,
                    required("OIDC_ISSUER")?,
                    required("API_CLIENT_ID")?,
                    required("ANTHROPIC_API_KEY")?,
                    required("ANTHROPIC_BASE_URL")?,
                ),
                _ => anyhow::bail!("APP_ENV must be prod, local, or test"),
            };
        Ok(Self {
            database: database_options(&db_url, &db_user, &db_password)?,
            issuer,
            audience,
            anthropic_key,
            anthropic_url,
            listen: env::var("LISTEN_ADDR").unwrap_or_else(|_| "0.0.0.0:8080".into()),
        })
    }
}

pub fn database_options(url: &str, user: &str, password: &str) -> anyhow::Result<PgConnectOptions> {
    Ok(
        PgConnectOptions::from_str(url.strip_prefix("jdbc:").unwrap_or(url))?
            .username(user)
            .password(password)
            .options([("search_path", "hello")]),
    )
}
