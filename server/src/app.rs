use std::path::Path;

use async_trait::async_trait;
use axum::{Extension, Router, middleware};
use loco_rs::{
    Result,
    app::{AppContext, Hooks},
    bgworker::Queue,
    boot::{self, BootResult, StartMode},
    config::Config,
    controller::{AppRoutes, Routes, monitoring},
    environment::Environment,
    task::Tasks,
};
use migration::Migrator;

use crate::{
    controllers, key_vault,
    middleware::{
        auth::{self, Auth},
        csrf,
    },
    services::anthropic::Anthropic,
    settings::Settings,
};

pub struct App;

#[async_trait]
impl Hooks for App {
    fn app_name() -> &'static str {
        env!("CARGO_PKG_NAME")
    }
    fn app_version() -> String {
        env!("CARGO_PKG_VERSION").into()
    }

    async fn load_config(environment: &Environment) -> Result<Config> {
        let mut config = environment.load()?;
        if *environment == Environment::Production {
            key_vault::configure(&mut config)
                .await
                .map_err(|error| loco_rs::Error::Any(error.into()))?;
        }
        // All pooled connections use the app schema, including migration metadata.
        let mut uri = url::Url::parse(&config.database.uri).map_err(loco_rs::Error::wrap)?;
        uri.query_pairs_mut()
            .append_pair("options", "-csearch_path=hello");
        config.database.uri = uri.into();
        config
            .settings::<Settings>()?
            .validate()
            .map_err(|error| loco_rs::Error::Any(error.into()))?;
        Ok(config)
    }

    async fn boot(
        mode: StartMode,
        environment: &Environment,
        config: Config,
    ) -> Result<BootResult> {
        boot::create_app::<Self, Migrator>(mode, environment, config).await
    }

    fn routes(_ctx: &AppContext) -> AppRoutes {
        AppRoutes::empty()
            .add_route(controllers::greetings::routes())
            .add_route(Routes::new().get("/healthz", monitoring::readiness))
    }

    async fn after_routes(router: Router, ctx: &AppContext) -> Result<Router> {
        let settings: Settings = ctx.config.settings()?;
        let auth = Auth::new(settings.oidc.issuer, settings.oidc.audience)
            .await
            .map_err(|error| loco_rs::Error::Any(error.into()))?;
        let ai = Anthropic::new(settings.anthropic).map_err(loco_rs::Error::wrap)?;
        Ok(router
            .layer(Extension(ai))
            .layer(middleware::from_fn_with_state(auth, auth::authorize))
            .layer(middleware::from_fn(csrf::protect)))
    }

    async fn connect_workers(_ctx: &AppContext, _queue: &Queue) -> Result<()> {
        Ok(())
    }
    fn register_tasks(_tasks: &mut Tasks) {}
    async fn truncate(_ctx: &AppContext) -> Result<()> {
        Ok(())
    }
    async fn seed(_ctx: &AppContext, _path: &Path) -> Result<()> {
        Ok(())
    }
}
