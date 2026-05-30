package io.github.mucsi96.skeleton.service;

import java.util.Map;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

import io.github.mucsi96.skeleton.config.AppProperties;

@Service
@ConditionalOnProperty(name = "app.email.provider", havingValue = "mock")
public class MockEmailService implements EmailService {

  private final RestClient restClient;

  public MockEmailService(AppProperties appProperties) {
    this.restClient = RestClient.create(appProperties.getEmail().getMockServerUri());
  }

  @Override
  public void sendMagicLink(String email, String link) {
    restClient.post()
        .uri("/send")
        .body(Map.of(
            "to", email,
            "subject", "Your sign-in link",
            "link", link))
        .retrieve()
        .toBodilessEntity();
  }
}
