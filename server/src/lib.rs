pub mod auth;
pub mod config;
pub mod csrf;

use std::time::Duration;

use axum::{
    Json, Router,
    extract::State,
    http::{HeaderValue, StatusCode, header},
    middleware,
    response::{IntoResponse, Response},
    routing::get,
};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;

pub static MIGRATOR: sqlx::migrate::Migrator = sqlx::migrate!("./migrations");

#[derive(Clone)]
pub struct AppState {
    pub database: PgPool,
    pub client: reqwest::Client,
    pub anthropic_url: String,
    pub anthropic_key: String,
}

pub fn http_client() -> anyhow::Result<reqwest::Client> {
    Ok(reqwest::Client::builder()
        .timeout(Duration::from_secs(60))
        .redirect(reqwest::redirect::Policy::none())
        .build()?)
}

pub fn router(state: AppState, auth: auth::Auth) -> Router {
    let api = Router::new()
        .route("/greeting", get(greeting))
        .fallback(|| async { StatusCode::NOT_FOUND })
        .layer(middleware::from_fn_with_state(auth, auth::authorize))
        .layer(middleware::from_fn(csrf::protect))
        .layer(middleware::map_response(
            |mut response: Response| async move {
                // Preserve the authenticated API's cache boundary across the migration.
                response
                    .headers_mut()
                    .insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
                response.headers_mut().insert(
                    header::X_CONTENT_TYPE_OPTIONS,
                    HeaderValue::from_static("nosniff"),
                );
                response
            },
        ));
    Router::new()
        .nest("/api", api)
        .route("/healthz", get(health))
        .with_state(state)
        .layer(tower_http::trace::TraceLayer::new_for_http())
}

async fn health(State(state): State<AppState>) -> StatusCode {
    match sqlx::query("SELECT 1").execute(&state.database).await {
        Ok(_) => StatusCode::OK,
        Err(_) => StatusCode::SERVICE_UNAVAILABLE,
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Greeting {
    name: String,
    message: String,
    ai_greeting: String,
}

#[derive(Deserialize)]
struct AnthropicResponse {
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

struct AppError(anyhow::Error);
impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        tracing::error!(error = %self.0, "greeting request failed");
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({"error": "Unable to generate greeting"})),
        )
            .into_response()
    }
}

async fn greeting(State(state): State<AppState>) -> Result<Json<Greeting>, AppError> {
    generate_greeting(&state).await.map(Json).map_err(AppError)
}

async fn generate_greeting(state: &AppState) -> anyhow::Result<Greeting> {
    let (name, message): (String, String) =
        sqlx::query_as("SELECT name, message FROM hello.greetings ORDER BY id LIMIT 1")
            .fetch_one(&state.database)
            .await?;
    let response: AnthropicResponse = state.client.post(format!("{}/v1/messages", state.anthropic_url.trim_end_matches('/')))
        .header("x-api-key", &state.anthropic_key).header("anthropic-version", "2023-06-01")
        .json(&serde_json::json!({
            "model": "claude-sonnet-4-6", "max_tokens": 1024,
            "system": "You are a friendly assistant. Generate a short, warm greeting.",
            "messages": [{"role": "user", "content": format!("Greet {name} with the following context: {message}")}]
        })).send().await?.error_for_status()?.json().await?;
    let ai_greeting = response
        .content
        .into_iter()
        .filter_map(|block| match block {
            Content::Text { text } => Some(text),
            Content::Other => None,
        })
        .collect::<Vec<_>>()
        .join("");
    anyhow::ensure!(
        !ai_greeting.trim().is_empty(),
        "Anthropic response has no text"
    );
    Ok(Greeting {
        name,
        message,
        ai_greeting,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{http::HeaderMap, routing::post};
    use serde_json::{Value, json};

    #[sqlx::test]
    async fn anthropic_request_preserves_context_and_rejects_failed_or_empty_responses(
        pool: PgPool,
    ) {
        rustls::crypto::ring::default_provider()
            .install_default()
            .ok();
        for (status, response, expected) in [
            (
                StatusCode::OK,
                json!({"content":[{"type":"text", "text":"Hello Igor!"}]}),
                Some("Hello Igor!"),
            ),
            (
                StatusCode::TOO_MANY_REQUESTS,
                json!({"error":"rate limited"}),
                None,
            ),
            (StatusCode::OK, json!({"content":[]}), None),
            (StatusCode::OK, json!({"unexpected":"payload"}), None),
        ] {
            let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
            let url = format!("http://{}", listener.local_addr().unwrap());
            let mock = Router::new().route(
                "/v1/messages",
                post(
                    move |headers: HeaderMap, Json(body): Json<Value>| async move {
                        assert_eq!(headers["x-api-key"], "fixture-key");
                        assert_eq!(headers["anthropic-version"], "2023-06-01");
                        assert_eq!(body["model"], "claude-sonnet-4-6");
                        assert_eq!(body["messages"][0]["role"], "user");
                        assert_eq!(
                            body["messages"][0]["content"],
                            "Greet Igor with the following context: Welcome to the skeleton app!"
                        );
                        (status, Json(response))
                    },
                ),
            );
            let task = tokio::spawn(async move {
                axum::serve(listener, mock).await.unwrap();
            });
            let state = AppState {
                database: pool.clone(),
                client: http_client().unwrap(),
                anthropic_url: url,
                anthropic_key: "fixture-key".into(),
            };
            let result = generate_greeting(&state).await;
            if let Some(text) = expected {
                let greeting = result.unwrap();
                assert_eq!(greeting.name, "Igor");
                assert_eq!(greeting.message, "Welcome to the skeleton app!");
                assert_eq!(greeting.ai_greeting, text);
                assert_eq!(serde_json::to_value(greeting).unwrap()["aiGreeting"], text);
            } else {
                let response = result.err().map(AppError).unwrap().into_response();
                assert_eq!(response.status(), StatusCode::INTERNAL_SERVER_ERROR);
                let bytes = axum::body::to_bytes(response.into_body(), 1024)
                    .await
                    .unwrap();
                assert_eq!(
                    serde_json::from_slice::<Value>(&bytes).unwrap(),
                    json!({"error":"Unable to generate greeting"})
                );
            }
            task.abort();
        }
    }
}
