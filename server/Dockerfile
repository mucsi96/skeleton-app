FROM docker.io/library/rust:1.99.1-bookworm AS build
WORKDIR /src
COPY Cargo.toml Cargo.lock rust-toolchain.toml ./
COPY src/ ./src/
COPY migrations/ ./migrations/
RUN cargo build --release --locked

FROM gcr.io/distroless/cc-debian12:nonroot
WORKDIR /app
COPY --from=build /src/target/release/skeleton-server /app/skeleton-server
LABEL org.opencontainers.image.source="https://github.com/mucsi96/skeleton-app"
ENV APP_ENV=prod LISTEN_ADDR=0.0.0.0:8080
EXPOSE 8080
USER 65532:65532
ENTRYPOINT ["/app/skeleton-server"]
