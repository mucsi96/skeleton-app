use sea_orm_migration::prelude::*;

mod m20261103_000001_greetings;

pub struct Migrator;

#[async_trait::async_trait]
impl MigratorTrait for Migrator {
    fn migrations() -> Vec<Box<dyn MigrationTrait>> {
        vec![Box::new(m20261103_000001_greetings::Migration)]
    }
}
