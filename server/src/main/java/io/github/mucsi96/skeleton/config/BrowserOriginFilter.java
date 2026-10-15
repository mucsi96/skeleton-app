package io.github.mucsi96.skeleton.config;

import java.io.IOException;
import java.net.URI;
import java.util.Collections;
import java.util.Set;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.web.filter.OncePerRequestFilter;

final class BrowserOriginFilter extends OncePerRequestFilter {
    private static final Set<String> SAFE_METHODS = Set.of("GET", "HEAD", "OPTIONS");
    private final String origin;

    BrowserOriginFilter(String origin) {
        final URI parsed = URI.create(origin);
        if (!Set.of("http", "https").contains(parsed.getScheme()) || parsed.getHost() == null
                || !parsed.getRawPath().isEmpty() || parsed.getRawQuery() != null
                || parsed.getRawFragment() != null || parsed.getRawUserInfo() != null) {
            throw new IllegalArgumentException("browser-origin must be an exact HTTP(S) origin without a path");
        }
        this.origin = origin;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return SAFE_METHODS.contains(request.getMethod()) && !"websocket".equalsIgnoreCase(request.getHeader("Upgrade"));
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        final var origins = Collections.list(request.getHeaders("Origin"));
        if (origins.size() != 1 || !origin.equals(origins.getFirst())) {
            response.setStatus(HttpServletResponse.SC_FORBIDDEN);
            response.setContentType("application/json");
            response.getWriter().write("{\"error\":\"invalid_origin\"}");
            return;
        }
        chain.doFilter(request, response);
    }
}
