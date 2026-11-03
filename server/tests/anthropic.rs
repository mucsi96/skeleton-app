use axum::{
    Json, Router,
    http::{HeaderMap, StatusCode},
    response::IntoResponse,
    routing::post,
};
use serde_json::{Value, json};
use skeleton_server::{services::anthropic::Anthropic, settings};

#[tokio::test]
async fn preserves_context_and_sanitizes_failed_or_empty_responses() {
    rustls::crypto::ring::default_provider()
        .install_default()
        .ok();
    for (status, response, expected) in [
        (
            StatusCode::OK,
            json!({"content":[{"type":"text","text":"Hello "},{"type":"text","text":"Igor!"}]}),
            Some("Hello Igor!"),
        ),
        (
            StatusCode::TOO_MANY_REQUESTS,
            json!({"error":"private upstream error"}),
            None,
        ),
        (StatusCode::OK, json!({"content":[]}), None),
        (StatusCode::OK, json!({"unexpected":"payload"}), None),
    ] {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let base_url = format!("http://{}", listener.local_addr().unwrap());
        let mock = Router::new().route(
            "/v1/messages",
            post(
                move |headers: HeaderMap, Json(body): Json<Value>| async move {
                    assert_eq!(headers["x-api-key"], "fixture-key");
                    assert_eq!(headers["anthropic-version"], "2023-06-01");
                    assert_eq!(body["model"], "claude-sonnet-4-6");
                    assert_eq!(
                        body["messages"][0]["content"],
                        "Greet Igor with the following context: Welcome!"
                    );
                    (status, Json(response))
                },
            ),
        );
        let task = tokio::spawn(async move {
            axum::serve(listener, mock).await.unwrap();
        });
        let ai = Anthropic::new(settings::Anthropic {
            base_url,
            api_key: "fixture-key".into(),
            model: "claude-sonnet-4-6".into(),
            max_tokens: 256,
            timeout_seconds: 5,
        })
        .unwrap();
        let result = ai.greet("Igor", "Welcome!").await;
        if let Some(text) = expected {
            assert_eq!(result.unwrap(), text);
        } else {
            let response = loco_rs::Error::wrap(result.unwrap_err()).into_response();
            assert_eq!(response.status(), StatusCode::INTERNAL_SERVER_ERROR);
            let bytes = axum::body::to_bytes(response.into_body(), 1024)
                .await
                .unwrap();
            let body = String::from_utf8(bytes.to_vec()).unwrap();
            assert!(!body.contains("private upstream error"));
            assert!(!body.contains("fixture-key"));
            assert!(!body.contains("127.0.0.1"));
        }
        task.abort();
    }
}
