package io.github.mucsi96.skeleton.controller;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import io.github.mucsi96.skeleton.model.GreetingResponse;
import io.github.mucsi96.skeleton.service.GreetingService;
import lombok.RequiredArgsConstructor;

@RestController
@RequiredArgsConstructor
public class GreetingController {
  private final GreetingService greetingService;

  @GetMapping("/greeting")
  public GreetingResponse getGreeting() {
    return greetingService.getGreeting();
  }
}
