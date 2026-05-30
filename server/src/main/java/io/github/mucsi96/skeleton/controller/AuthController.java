package io.github.mucsi96.skeleton.controller;

import java.util.List;

import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import io.github.mucsi96.skeleton.service.MagicLinkService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;

@RestController
@RequestMapping("/auth")
@RequiredArgsConstructor
public class AuthController {

  private final MagicLinkService magicLinkService;
  private final SecurityContextRepository securityContextRepository;

  @PostMapping("/request-link")
  public void requestLink(@RequestBody RequestLinkRequest request) {
    magicLinkService.requestLink(request.email());
  }

  @PostMapping("/verify")
  public UserResponse verify(
      @RequestBody VerifyRequest request,
      HttpServletRequest httpRequest,
      HttpServletResponse httpResponse) {
    final String email = magicLinkService.verifyToken(request.token());

    final Authentication authentication = new UsernamePasswordAuthenticationToken(
        email, null, List.of(new SimpleGrantedAuthority("ROLE_USER")));
    final SecurityContext context = SecurityContextHolder.createEmptyContext();
    context.setAuthentication(authentication);
    SecurityContextHolder.setContext(context);
    securityContextRepository.saveContext(context, httpRequest, httpResponse);

    return new UserResponse(email);
  }

  @GetMapping("/me")
  public UserResponse me(Authentication authentication) {
    return new UserResponse(authentication.getName());
  }

  @PostMapping("/logout")
  public void logout(HttpServletRequest request) {
    request.getSession().invalidate();
    SecurityContextHolder.clearContext();
  }

  public record RequestLinkRequest(String email) {
  }

  public record VerifyRequest(String token) {
  }

  public record UserResponse(String email) {
  }
}
