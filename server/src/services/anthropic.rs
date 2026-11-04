use std::time::Duration;

use serde::Deserialize;

use crate::settings::Anthropic as Settings;

#[derive(Clone)]
pub struct Anthropic {
    client: reqwest::Client,
    settings: Settings,
}

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("Anthropic request failed")]
    Request(#[from] reqwest::Error),
    #[error("Anthropic response has no text")]
    EmptyResponse,
}

#[derive(Deserialize)]
struct Message {
    content: Vec<Content>,
}

#[derive(Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum Content {
    Text {
        text: String,
    },
    #[serde(other)]
    Other,
}

impl Anthropic {
    pub fn new(settings: Settings) -> Result<Self, Error> {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(settings.timeout_seconds))
            .redirect(reqwest::redirect::Policy::none())
            .build()?;
        Ok(Self { client, settings })
    }

    pub async fn greet(&self, name: &str, message: &str) -> Result<String, Error> {
        let response: Message = self.client
            .post(format!("{}/v1/messages", self.settings.base_url.trim_end_matches('/')))
            .header("x-api-key", &self.settings.api_key)
            .header("anthropic-version", "2023-06-01")
            .json(&serde_json::json!({
                "model": self.settings.model,
                "max_tokens": self.settings.max_tokens,
                "system": "You are a friendly assistant. Generate a short, warm greeting.",
                "messages": [{"role": "user", "content": format!("Greet {name} with the following context: {message}")}]
            }))
            .send().await?.error_for_status()?.json().await?;
        let text = response
            .content
            .into_iter()
            .filter_map(|block| match block {
                Content::Text { text } => Some(text),
                Content::Other => None,
            })
            .collect::<Vec<_>>()
            .join("");
        if text.trim().is_empty() {
            return Err(Error::EmptyResponse);
        }
        Ok(text)
    }
}
