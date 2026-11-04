use axum::Extension;
use loco_rs::prelude::*;
use sea_orm::{EntityTrait, QueryOrder};
use serde::Serialize;

use crate::{models::greetings, services::anthropic::Anthropic};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Greeting {
    name: String,
    message: String,
    ai_greeting: String,
}

async fn show(
    State(ctx): State<AppContext>,
    Extension(ai): Extension<Anthropic>,
) -> Result<Response> {
    let greeting = greetings::Entity::find()
        .order_by_asc(greetings::Column::Id)
        .one(&ctx.db)
        .await?
        .ok_or(Error::InternalServerError)?;
    let ai_greeting = ai
        .greet(&greeting.name, &greeting.message)
        .await
        .map_err(Error::wrap)?;
    format::json(Greeting {
        name: greeting.name,
        message: greeting.message,
        ai_greeting,
    })
}

pub fn routes() -> Routes {
    Routes::at("/api/greeting").get("/", show)
}
