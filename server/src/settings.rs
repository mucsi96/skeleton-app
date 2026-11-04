use serde::{Deserialize, Serialize};

#[derive(Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Settings {
    pub oidc: Oidc,
    pub anthropic: Anthropic,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Oidc {
    pub issuer: String,
    pub audience: String,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Anthropic {
    pub base_url: String,
    pub api_key: String,
    pub model: String,
    pub max_tokens: u32,
    pub timeout_seconds: u64,
}

impl Settings {
    pub fn validate(&self) -> anyhow::Result<()> {
        anyhow::ensure!(
            [
                &self.oidc.issuer,
                &self.oidc.audience,
                &self.anthropic.api_key,
                &self.anthropic.model
            ]
            .iter()
            .all(|value| !value.trim().is_empty()),
            "OIDC issuer/audience and Anthropic key/model must not be empty"
        );
        anyhow::ensure!(
            self.anthropic.max_tokens > 0 && self.anthropic.timeout_seconds > 0,
            "Anthropic limits must be positive"
        );
        crate::middleware::auth::validate_endpoint(&self.oidc.issuer)?;
        crate::middleware::auth::validate_endpoint(&self.anthropic.base_url)?;
        Ok(())
    }
}
