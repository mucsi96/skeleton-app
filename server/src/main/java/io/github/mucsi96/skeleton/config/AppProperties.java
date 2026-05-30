package io.github.mucsi96.skeleton.config;

import java.time.Duration;
import java.util.List;

import org.springframework.boot.context.properties.ConfigurationProperties;

import lombok.Data;

@Data
@ConfigurationProperties(prefix = "app")
public class AppProperties {

  /** Emails allowed to authenticate. Login requests for any other address are ignored. */
  private List<String> allowedEmails = List.of();

  /** Public base URL of the client, used to build the magic link sent by email. */
  private String baseUrl;

  /** How long a magic link stays valid after it is issued. */
  private Duration magicLinkValidity = Duration.ofMinutes(15);

  private Email email = new Email();

  @Data
  public static class Email {
    /** Email delivery strategy: "smtp", "mock" or "log". */
    private String provider = "log";

    /** Base URL of the mock email server (only used when provider is "mock"). */
    private String mockServerUri;

    /** Sender address used for outgoing magic-link emails. */
    private String from = "no-reply@skeleton-app";
  }
}
