use std::{
    sync::LazyLock,
    time::{SystemTime, UNIX_EPOCH},
};

use axum::{
    Json, Router,
    body::Body,
    http::{Request, StatusCode},
    middleware,
    routing::get,
};
use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use jsonwebtoken::{Algorithm, EncodingKey, Header, encode};
use rsa::{RsaPrivateKey, pkcs8::EncodePrivateKey, rand_core::OsRng, traits::PublicKeyParts};
use serde_json::{Value, json};
use skeleton_server::middleware::{
    auth::{Auth, authorize},
    csrf,
};
use tower::ServiceExt;

static KEY: LazyLock<RsaPrivateKey> =
    LazyLock::new(|| RsaPrivateKey::new(&mut OsRng, 2048).unwrap());

async fn fixture() -> (Router, Value, tokio::task::JoinHandle<()>) {
    rustls::crypto::ring::default_provider()
        .install_default()
        .ok();
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let issuer = format!("http://{}", listener.local_addr().unwrap());
    let discovery = json!({"issuer": issuer, "jwks_uri": format!("{issuer}/keys")});
    let keys = json!({"keys": [{"kty":"RSA", "kid":"test", "alg":"RS256", "use":"sig",
        "n": URL_SAFE_NO_PAD.encode(KEY.n().to_bytes_be()), "e": URL_SAFE_NO_PAD.encode(KEY.e().to_bytes_be())}]});
    let oidc = Router::new()
        .route(
            "/.well-known/openid-configuration",
            get(|| async { Json(discovery) }),
        )
        .route("/keys", get(|| async { Json(keys) }));
    let task = tokio::spawn(async move {
        axum::serve(listener, oidc).await.unwrap();
    });
    let auth = Auth::new(issuer.clone(), "skeleton".into()).await.unwrap();
    let router = Router::new()
        .route(
            "/api/greeting",
            get(|| async { "hello" }).post(|| async { "updated" }),
        )
        .layer(middleware::from_fn_with_state(auth, authorize))
        .layer(middleware::from_fn(csrf::protect));
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs();
    (
        router,
        json!({"iss":issuer, "aud":"skeleton", "exp":now+600, "nbf":now-1,
        "scp":"api-access", "roles":["readGreetings"]}),
        task,
    )
}

fn token(claims: &Value) -> String {
    let key = KEY.to_pkcs8_pem(Default::default()).unwrap();
    let mut header = Header::new(Algorithm::RS256);
    header.kid = Some("test".into());
    encode(
        &header,
        claims,
        &EncodingKey::from_rsa_pem(key.as_bytes()).unwrap(),
    )
    .unwrap()
}

#[tokio::test]
async fn validates_signature_issuer_audience_time_scope_and_role() {
    let (app, claims, task) = fixture().await;
    let valid = token(&claims);
    for (field, value, expected) in [
        (
            "iss",
            json!("https://wrong.example"),
            StatusCode::UNAUTHORIZED,
        ),
        ("aud", json!("wrong-api"), StatusCode::UNAUTHORIZED),
        ("exp", json!(1), StatusCode::UNAUTHORIZED),
        ("nbf", json!(u32::MAX), StatusCode::UNAUTHORIZED),
        ("scp", json!("other"), StatusCode::FORBIDDEN),
        ("roles", json!(["createGreeting"]), StatusCode::FORBIDDEN),
    ] {
        let mut invalid = claims.clone();
        invalid[field] = value;
        let response = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/greeting")
                    .header("Authorization", format!("Bearer {}", token(&invalid)))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), expected, "{field}");
    }
    for (bearer, expected) in [
        (valid.as_str(), StatusCode::OK),
        ("forged", StatusCode::UNAUTHORIZED),
    ] {
        let response = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/greeting")
                    .header("Authorization", format!("Bearer {bearer}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), expected);
    }
    let response = app
        .oneshot(
            Request::builder()
                .uri("/api/greeting")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    task.abort();
}

#[tokio::test]
async fn protects_every_unsafe_method_including_proxy_bearer_requests() {
    let (app, claims, task) = fixture().await;
    let bearer = format!("Bearer {}", token(&claims));
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/greeting")
                .header("Authorization", &bearer)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    let cookie = response.headers()["set-cookie"].to_str().unwrap();
    assert!(cookie.contains("; Path=/; Secure; SameSite=Lax"));
    assert!(!cookie.contains("HttpOnly") && !cookie.contains("Domain"));
    let pair = cookie.split(';').next().unwrap();
    let token = pair.split('=').nth(1).unwrap();
    for method in ["POST", "PUT", "PATCH", "DELETE"] {
        for (cookie, header) in [("", token), (pair, ""), (pair, "forged")] {
            let response = app
                .clone()
                .oneshot(
                    Request::builder()
                        .method(method)
                        .uri("/api/greeting")
                        .header("Authorization", &bearer)
                        .header("Cookie", cookie)
                        .header("X-XSRF-TOKEN", header)
                        .body(Body::empty())
                        .unwrap(),
                )
                .await
                .unwrap();
            assert_eq!(response.status(), StatusCode::FORBIDDEN, "{method}");
        }
    }
    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/greeting")
                .header("Authorization", &bearer)
                .header("Cookie", pair)
                .header("X-XSRF-TOKEN", token)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    task.abort();
}
