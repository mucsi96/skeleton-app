package io.github.mucsi96.skeleton.repository;

import org.springframework.data.jpa.repository.JpaRepository;

import io.github.mucsi96.skeleton.entity.Greeting;

public interface GreetingRepository extends JpaRepository<Greeting, Long> {
}
