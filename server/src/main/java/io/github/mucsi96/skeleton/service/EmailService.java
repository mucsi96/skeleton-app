package io.github.mucsi96.skeleton.service;

public interface EmailService {
  void sendMagicLink(String email, String link);
}
