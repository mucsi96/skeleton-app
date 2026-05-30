package io.github.mucsi96.skeleton.repository;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

import io.github.mucsi96.skeleton.entity.AuthToken;

public interface AuthTokenRepository extends JpaRepository<AuthToken, Long> {
  Optional<AuthToken> findByToken(String token);
}
