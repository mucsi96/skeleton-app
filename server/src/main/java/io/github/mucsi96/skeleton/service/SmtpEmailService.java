package io.github.mucsi96.skeleton.service;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Service;

import io.github.mucsi96.skeleton.config.AppProperties;
import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
@ConditionalOnProperty(name = "app.email.provider", havingValue = "smtp")
public class SmtpEmailService implements EmailService {

  private final JavaMailSender mailSender;
  private final AppProperties appProperties;

  @Override
  public void sendMagicLink(String email, String link) {
    final SimpleMailMessage message = new SimpleMailMessage();
    message.setFrom(appProperties.getEmail().getFrom());
    message.setTo(email);
    message.setSubject("Your sign-in link");
    message.setText("Click the link below to sign in:\n\n" + link
        + "\n\nThis link expires in " + appProperties.getMagicLinkValidity().toMinutes() + " minutes.");
    mailSender.send(message);
  }
}
