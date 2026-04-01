package io.github.mucsi96.skeleton.config;

import java.io.IOException;
import java.util.concurrent.TimeUnit;

import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;

import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import lombok.extern.slf4j.Slf4j;

@Profile("local")
@Configuration
@Slf4j
public class LocalDatabaseConfiguration {

    private static final String POD_NAME = "skeleton-app-dev";
    private static final String DB_CONTAINER = "skeleton-app-dev-db";
    private static final String DB_IMAGE = "docker.io/library/postgres:17.5-bullseye";
    private static final int MAX_WAIT_SECONDS = 60;

    @PostConstruct
    void startDatabase() throws IOException, InterruptedException {
        if (isContainerRunning()) {
            log.info("Database container is already running");
            return;
        }

        stopPod();

        log.info("Creating pod...");
        run("podman", "pod", "create", "--name", POD_NAME, "-p", "5433:5432");

        log.info("Starting database container...");
        run("podman", "run", "-d", "--pod", POD_NAME, "--name", DB_CONTAINER,
                "-e", "POSTGRES_DB=skeleton",
                "-e", "POSTGRES_USER=postgres",
                "-e", "POSTGRES_PASSWORD=postgres",
                "--health-cmd", "pg_isready -U postgres",
                "--health-interval", "2s",
                "--health-timeout", "5s",
                "--health-retries", "5",
                DB_IMAGE);

        waitForHealthy();
        log.info("Database is ready");
    }

    @PreDestroy
    void stopDatabase() {
        log.info("Stopping database pod...");
        stopPod();
    }

    private boolean isContainerRunning() throws IOException, InterruptedException {
        final ProcessBuilder pb = new ProcessBuilder(
                "podman", "inspect", "--format", "{{.State.Running}}", DB_CONTAINER);
        pb.redirectErrorStream(true);
        final Process process = pb.start();
        final String output = new String(process.getInputStream().readAllBytes()).trim();
        process.waitFor(5, TimeUnit.SECONDS);
        return "true".equals(output);
    }

    private void waitForHealthy() throws IOException, InterruptedException {
        int elapsed = 0;
        while (elapsed < MAX_WAIT_SECONDS) {
            final ProcessBuilder pb = new ProcessBuilder(
                    "podman", "inspect", "--format", "{{.State.Health.Status}}", DB_CONTAINER);
            pb.redirectErrorStream(true);
            final Process process = pb.start();
            final String status = new String(process.getInputStream().readAllBytes()).trim();
            process.waitFor(5, TimeUnit.SECONDS);
            if ("healthy".equals(status)) {
                return;
            }
            Thread.sleep(2000);
            elapsed += 2;
        }
        throw new IllegalStateException("Timeout waiting for database to become healthy");
    }

    private void stopPod() {
        try {
            run("podman", "pod", "rm", "-f", POD_NAME);
        } catch (final Exception e) {
            log.debug("Pod cleanup: {}", e.getMessage());
        }
    }

    private void run(String... command) throws IOException, InterruptedException {
        final ProcessBuilder pb = new ProcessBuilder(command);
        pb.inheritIO();
        final Process process = pb.start();
        final int exitCode = process.waitFor();
        if (exitCode != 0) {
            throw new IOException(
                    "Command failed with exit code " + exitCode + ": " + String.join(" ", command));
        }
    }
}
