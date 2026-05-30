package io.github.mucsi96.skeleton.service;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Service;

import lombok.extern.slf4j.Slf4j;

@Slf4j
@Service
@ConditionalOnProperty(name = "app.email.provider", havingValue = "log", matchIfMissing = true)
public class LoggingEmailService implements EmailService {

  @Override
  public void sendMagicLink(String email, String link) {
    log.info("Magic link for {}: {}", email, link);
  }
}
