package io.github.mucsi96.skeleton.service;

import java.security.SecureRandom;
import java.time.Instant;
import java.util.Base64;
import java.util.Locale;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.util.UriComponentsBuilder;

import io.github.mucsi96.skeleton.config.AppProperties;
import io.github.mucsi96.skeleton.entity.AuthToken;
import io.github.mucsi96.skeleton.repository.AuthTokenRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

@Slf4j
@Service
@RequiredArgsConstructor
public class MagicLinkService {

  private static final SecureRandom RANDOM = new SecureRandom();

  private final AppProperties appProperties;
  private final AuthTokenRepository authTokenRepository;
  private final EmailService emailService;

  /**
   * Issues a magic link for the given email when it is on the allowlist. The
   * response is intentionally uniform regardless of whether the email is allowed,
   * to avoid disclosing which addresses are accepted.
   */
  public void requestLink(String email) {
    final String normalizedEmail = normalize(email);

    if (!isAllowed(normalizedEmail)) {
      log.info("Ignoring magic link request for non-allowlisted email: {}", normalizedEmail);
      return;
    }

    final String token = generateToken();
    final Instant now = Instant.now();

    authTokenRepository.save(AuthToken.builder()
        .token(token)
        .email(normalizedEmail)
        .expiresAt(now.plus(appProperties.getMagicLinkValidity()))
        .used(false)
        .createdAt(now)
        .build());

    final String link = UriComponentsBuilder
        .fromUriString(appProperties.getBaseUrl())
        .path("/auth/verify")
        .queryParam("token", token)
        .build()
        .toUriString();

    emailService.sendMagicLink(normalizedEmail, link);
  }

  /**
   * Validates a magic link token, marking it used, and returns the email it was
   * issued for. Fails fast for unknown, expired or already used tokens.
   */
  public String verifyToken(String token) {
    final AuthToken authToken = authTokenRepository.findByToken(token)
        .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid sign-in link"));

    if (authToken.isUsed() || authToken.getExpiresAt().isBefore(Instant.now())) {
      throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Sign-in link has expired");
    }

    authToken.setUsed(true);
    authTokenRepository.save(authToken);

    return authToken.getEmail();
  }

  private boolean isAllowed(String email) {
    return appProperties.getAllowedEmails().stream()
        .map(this::normalize)
        .anyMatch(allowed -> allowed.equals(email));
  }

  private String normalize(String email) {
    return email.strip().toLowerCase(Locale.ROOT);
  }

  private String generateToken() {
    final byte[] bytes = new byte[32];
    RANDOM.nextBytes(bytes);
    return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
  }
}
