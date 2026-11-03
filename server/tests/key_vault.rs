use skeleton_server::key_vault::database_uri;
use sqlx::postgres::PgConnectOptions;

#[test]
fn key_vault_jdbc_urls_preserve_options_and_encode_credentials() {
    let uri = database_uri(
        "jdbc:postgresql://db.example/app?sslmode=require",
        "user%40@tenant",
        "p@ss:/?#%2Fword",
    )
    .unwrap();
    let options: PgConnectOptions = uri.parse().unwrap();
    assert_eq!(options.get_username(), "user%40@tenant");
    assert_eq!(options.get_host(), "db.example");
    assert_eq!(options.get_database(), Some("app"));
    assert!(matches!(
        options.get_ssl_mode(),
        sqlx::postgres::PgSslMode::Require
    ));
    assert!(uri.contains("p%40ss%3A%2F%3F%23%252Fword"));
    assert!(database_uri("https://db.example/app", "user", "password").is_err());
}
