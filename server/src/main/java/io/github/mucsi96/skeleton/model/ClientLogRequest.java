package io.github.mucsi96.skeleton.model;

import java.util.Map;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record ClientLogRequest(
    @NotBlank @Pattern(regexp = "error|warn|info|debug") String level,
    @NotBlank @Size(max = 100) String context,
    @NotBlank @Size(max = 20_000) String message,
    @Size(max = 64) String timestamp,
    @Size(max = 100) Map<String, Object> details) {
}
