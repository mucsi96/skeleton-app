package io.github.mucsi96.skeleton.controller;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class EnvironmentController {
  @Value("${client-log-url:}")
  private String clientLogUrl;

  @Value("${client-app-name:}")
  private String clientAppName;

  @GetMapping("/environment")
  public ConfigResponse getConfig() {
    return new ConfigResponse(clientLogUrl, clientAppName);
  }

  public record ConfigResponse(String clientLogUrl, String clientAppName) {}
}
