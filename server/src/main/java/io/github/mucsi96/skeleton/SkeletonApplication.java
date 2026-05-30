package io.github.mucsi96.skeleton;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

import io.github.mucsi96.skeleton.config.DatabaseStartupInitializer;

@SpringBootApplication
@ConfigurationPropertiesScan
public class SkeletonApplication {

  public static void main(String[] args) {
    final SpringApplication app = new SpringApplication(SkeletonApplication.class);
    app.addInitializers(new DatabaseStartupInitializer());
    app.run(args);
  }
}
