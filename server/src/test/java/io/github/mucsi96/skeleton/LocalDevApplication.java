package io.github.mucsi96.skeleton;

import org.springframework.boot.SpringApplication;

public class LocalDevApplication {

    public static void main(String[] args) {
        SpringApplication.from(SkeletonApplication::main)
                .with(LocalDatabaseConfiguration.class)
                .run(args);
    }
}
