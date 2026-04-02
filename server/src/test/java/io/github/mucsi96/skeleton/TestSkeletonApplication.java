package io.github.mucsi96.skeleton;

import org.springframework.boot.SpringApplication;

public class TestSkeletonApplication {

    public static void main(String[] args) {
        SpringApplication.from(SkeletonApplication::main)
                .with(ContainersConfiguration.class)
                .run(args);
    }
}
