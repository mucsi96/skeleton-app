use migration::Migrator;
use sea_orm::SqlxPostgresConnector;
use sea_orm_migration::MigratorTrait;
use sqlx::PgPool;

async fn migrate(pool: &PgPool) {
    let db = SqlxPostgresConnector::from_sqlx_postgres_pool(pool.clone());
    Migrator::up(&db, None).await.unwrap();
}

#[sqlx::test(migrations = false)]
async fn migration_metadata_can_live_in_app_schema(pool: PgPool) {
    sqlx::query("CREATE SCHEMA hello")
        .execute(&pool)
        .await
        .unwrap();
    let options = pool
        .connect_options()
        .as_ref()
        .clone()
        .options([("search_path", "hello")]);
    let app_pool = PgPool::connect_with(options).await.unwrap();
    migrate(&app_pool).await;
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM hello.seaql_migrations")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(count, 1);
    app_pool.close().await;
}

#[sqlx::test(migrations = false)]
async fn fresh_database_is_seeded_once(pool: PgPool) {
    migrate(&pool).await;
    migrate(&pool).await;
    let rows: Vec<(i64, String, String)> =
        sqlx::query_as("SELECT id, name, message FROM hello.greetings")
            .fetch_all(&pool)
            .await
            .unwrap();
    assert_eq!(
        rows,
        vec![(1, "Igor".into(), "Welcome to the skeleton app!".into())]
    );
}

#[sqlx::test(migrations = false)]
async fn adopts_liquibase_database_without_changing_rows_or_sequence(pool: PgPool) {
    sqlx::raw_sql("CREATE SCHEMA hello;
        CREATE TABLE hello.databasechangelog (id text);
        INSERT INTO hello.databasechangelog VALUES ('2-seed-initial-greeting');
        CREATE TABLE hello.greetings (id BIGSERIAL PRIMARY KEY, name TEXT NOT NULL, message TEXT NOT NULL);
        INSERT INTO hello.greetings (name, message) VALUES ('Existing user', 'Persisted message');")
        .execute(&pool).await.unwrap();
    migrate(&pool).await;
    let rows: Vec<(i64, String, String)> =
        sqlx::query_as("SELECT id, name, message FROM hello.greetings")
            .fetch_all(&pool)
            .await
            .unwrap();
    assert_eq!(
        rows,
        vec![(1, "Existing user".into(), "Persisted message".into())]
    );
    let id: i64 = sqlx::query_scalar(
        "INSERT INTO hello.greetings (name, message) VALUES ('Next', 'New') RETURNING id",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(id, 2);
    let changelog: String = sqlx::query_scalar("SELECT id FROM hello.databasechangelog")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(changelog, "2-seed-initial-greeting");
}

#[sqlx::test(migrations = false)]
async fn existing_empty_table_stays_empty(pool: PgPool) {
    sqlx::raw_sql("CREATE SCHEMA hello;
        CREATE TABLE hello.greetings (id BIGSERIAL PRIMARY KEY, name TEXT NOT NULL, message TEXT NOT NULL);")
        .execute(&pool).await.unwrap();
    migrate(&pool).await;
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM hello.greetings")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(count, 0);
}
