package io.github.mucsi96.skeleton.model;

import java.util.Map;

public record ClientLogRequest(
    String level,
    String context,
    String message,
    String timestamp,
    Map<String, Object> details) {
}
