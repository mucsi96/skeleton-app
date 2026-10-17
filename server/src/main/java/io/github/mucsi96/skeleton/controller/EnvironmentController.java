package io.github.mucsi96.skeleton.controller;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Map;
import org.springframework.aot.hint.annotation.RegisterReflectionForBinding;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.util.UriComponentsBuilder;

@RestController
@RegisterReflectionForBinding({EnvironmentController.ConfigResponse.class, EnvironmentController.RedirectResponse.class})
public class EnvironmentController {
  private final ConfigResponse config;
  private final URI sessionUri;
  private final URI signInUri;
  private final HttpClient client = HttpClient.newBuilder()
      .connectTimeout(Duration.ofSeconds(3)).followRedirects(HttpClient.Redirect.NEVER).build();

  public EnvironmentController(
      @Value("${client-log-url:}") String clientLogUrl,
      @Value("${client-app-name:}") String clientAppName,
      @Value("${AUTH_SESSION_URL}") String sessionUrl,
      @Value("${AUTH_SIGN_IN_URL}") String signInUrl) {
    this.config = new ConfigResponse(clientLogUrl, clientAppName);
    this.sessionUri = endpoint(sessionUrl);
    this.signInUri = endpoint(signInUrl);
  }

  @GetMapping("/environment")
  public ResponseEntity<?> getConfig(
      @RequestHeader(value = HttpHeaders.COOKIE, defaultValue = "") String cookie,
      @RequestParam(defaultValue = "/") String returnTo) {
    String target = returnTarget(returnTo);
    var request = HttpRequest.newBuilder(sessionUri).timeout(Duration.ofSeconds(5))
        .header(HttpHeaders.COOKIE, cookie).header(HttpHeaders.ACCEPT, "application/json")
        .header("X-Forwarded-Host", signInUri.getRawAuthority())
        .header("X-Forwarded-Proto", signInUri.getScheme())
        .header("X-Forwarded-Uri", target).GET().build();
    try {
      var session = client.send(request, HttpResponse.BodyHandlers.discarding());
      var response = ResponseEntity.ok().cacheControl(CacheControl.noStore());
      response.header(HttpHeaders.SET_COOKIE, session.headers().allValues(HttpHeaders.SET_COOKIE).toArray(String[]::new));
      if (session.statusCode() >= 200 && session.statusCode() < 300) return response.body(config);
      if (session.statusCode() == 401 || session.statusCode() == 403) {
        String redirect = UriComponentsBuilder.fromUri(signInUri)
            .replaceQueryParam("rd", target).build().encode().toUriString();
        return response.body(new RedirectResponse(redirect));
      }
      return unavailable();
    } catch (InterruptedException error) {
      Thread.currentThread().interrupt();
      return unavailable();
    } catch (IOException error) {
      return unavailable();
    }
  }

  private static ResponseEntity<?> unavailable() {
    return ResponseEntity.status(503).cacheControl(CacheControl.noStore())
        .body(Map.of("message", "The page is temporarily unavailable."));
  }

  private static URI endpoint(String value) {
    URI uri = URI.create(value);
    if (!("https".equals(uri.getScheme()) || "http".equals(uri.getScheme()))
        || uri.getHost() == null || uri.getUserInfo() != null || uri.getFragment() != null) {
      throw new IllegalArgumentException("Bootstrap endpoints must be absolute HTTP(S) URLs");
    }
    return uri;
  }

  private static String returnTarget(String value) {
    try {
      URI target = URI.create(value);
      String path = target.getPath();
      return !target.isAbsolute() && target.getRawAuthority() == null && path != null
          && path.startsWith("/") && !path.startsWith("//") && !path.contains("\\") ? target.toString() : "/";
    } catch (IllegalArgumentException error) {
      return "/";
    }
  }

  public record ConfigResponse(String clientLogUrl, String clientAppName) {}
  public record RedirectResponse(String redirectTo) {}
}
