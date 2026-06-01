package io.github.mucsi96.skeleton.config;

import java.io.IOException;
import java.time.Duration;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * Cheap front-door protection for the public {@code /logs} sink.
 *
 * Caps the request body size and applies a per-client fixed-window rate limit
 * before the body is ever parsed, so an anonymous caller cannot flood the logs
 * or exhaust resources. The client IP comes from {@code getRemoteAddr()}, which
 * already reflects the real client thanks to {@code forward-headers-strategy}.
 */
@Component
public class ClientLogProtectionFilter extends OncePerRequestFilter {

  private static final int MAX_PAYLOAD_BYTES = 64 * 1024;
  private static final int MAX_REQUESTS_PER_WINDOW = 60;
  private static final long WINDOW_MS = Duration.ofMinutes(1).toMillis();
  private static final int MAX_TRACKED_CLIENTS = 10_000;

  private final Map<String, Window> windows = new ConcurrentHashMap<>();

  @Override
  protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
      FilterChain chain) throws ServletException, IOException {

    if (!isLogRequest(request)) {
      chain.doFilter(request, response);
      return;
    }

    if (request.getContentLengthLong() > MAX_PAYLOAD_BYTES) {
      response.sendError(HttpStatus.PAYLOAD_TOO_LARGE.value());
      return;
    }

    if (!tryAcquire(request.getRemoteAddr())) {
      response.sendError(HttpStatus.TOO_MANY_REQUESTS.value());
      return;
    }

    chain.doFilter(request, response);
  }

  private boolean isLogRequest(HttpServletRequest request) {
    return "POST".equalsIgnoreCase(request.getMethod())
        && request.getRequestURI().endsWith("/logs");
  }

  private boolean tryAcquire(String clientId) {
    final long now = System.currentTimeMillis();

    if (windows.size() > MAX_TRACKED_CLIENTS) {
      windows.values().removeIf(window -> now - window.startMs >= WINDOW_MS);
    }

    final Window window = windows.compute(clientId, (key, existing) ->
        existing == null || now - existing.startMs >= WINDOW_MS
            ? new Window(now)
            : existing);

    return window.count.incrementAndGet() <= MAX_REQUESTS_PER_WINDOW;
  }

  private static final class Window {
    private final long startMs;
    private final AtomicInteger count = new AtomicInteger();

    private Window(long startMs) {
      this.startMs = startMs;
    }
  }
}
