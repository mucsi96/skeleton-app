package io.github.mucsi96.skeleton.config;

import java.io.IOException;
import java.nio.file.Path;

import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;

import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;

@Profile("local")
@Configuration
@Slf4j
public class LocalDatabaseConfiguration {

    @PostConstruct
    void startDatabase() throws IOException, InterruptedException {
        final Path scriptPath = Path.of(System.getProperty("user.dir"), "..", "scripts", "dev_db_up.sh")
                .toAbsolutePath().normalize();
        log.info("Starting development database using {}", scriptPath);
        final ProcessBuilder pb = new ProcessBuilder("bash", scriptPath.toString());
        pb.inheritIO();
        final int exitCode = pb.start().waitFor();
        if (exitCode != 0) {
            throw new IllegalStateException("dev_db_up.sh failed with exit code " + exitCode);
        }
    }
}
