package io.github.mucsi96.skeleton.controller;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import io.github.mucsi96.skeleton.model.ClientLogRequest;

/**
 * Unprotected sink for client-side logs.
 *
 * The Angular app forwards console errors and the full authentication lifecycle
 * (refresh-token renewals vs. full re-authentication) here so the flow can be
 * followed in the backend logs. It is intentionally public - it must keep
 * working even when the user is unauthenticated or the token has expired, which
 * is exactly when auth-related logs are most valuable.
 */
@RestController
public class LogController {

  private static final Logger clientLogger = LoggerFactory.getLogger("client");

  @PostMapping("/logs")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  public void log(@RequestBody ClientLogRequest request) {
    final String message = format(request);

    switch (request.level()) {
      case "error" -> clientLogger.error(message);
      case "warn" -> clientLogger.warn(message);
      case "debug" -> clientLogger.debug(message);
      default -> clientLogger.info(message);
    }
  }

  private String format(ClientLogRequest request) {
    final String details = request.details() == null || request.details().isEmpty()
        ? ""
        : " " + request.details();
    return "[%s] [%s] %s%s".formatted(
        request.timestamp(),
        request.context(),
        request.message(),
        details);
  }
}
