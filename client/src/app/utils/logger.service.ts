import { Injectable } from '@angular/core';

export type ClientLogLevel = 'error' | 'warn' | 'info' | 'debug';

const LOG_ENDPOINT = '/api/logs';

/**
 * Ships client-side logs to the unprotected backend `/api/logs` sink.
 *
 * Uses a bare `fetch` (not `HttpClient`) on purpose: it must bypass the auth,
 * error and timezone interceptors so that logging never adds a bearer token,
 * never surfaces an error notification, and - most importantly - never recurses
 * (a failed log POST must not produce another logged error).
 */
@Injectable({ providedIn: 'root' })
export class LoggerService {
  private consoleCaptureInstalled = false;

  log(
    level: ClientLogLevel,
    context: string,
    message: string,
    details: Record<string, unknown> = {}
  ): void {
    const payload = {
      level,
      context,
      message,
      timestamp: new Date().toISOString(),
      details,
    };

    try {
      void fetch(LOG_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive: true,
      }).catch(() => {});
    } catch {
      // Logging must never throw or surface to the user.
    }
  }

  /**
   * Forwards every console error, uncaught error and unhandled promise
   * rejection to the backend while keeping the original console behaviour.
   */
  initBrowserErrorCapture(): void {
    if (this.consoleCaptureInstalled) {
      return;
    }
    this.consoleCaptureInstalled = true;

    const originalError = console.error.bind(console);
    console.error = (...args: unknown[]) => {
      this.log('error', 'console', formatArgs(args));
      originalError(...args);
    };

    window.addEventListener('error', (event) => {
      const error = event.error;
      this.log('error', 'window', event.message || 'Uncaught error', {
        filename: event.filename,
        line: event.lineno,
        column: event.colno,
        stack: error instanceof Error ? error.stack : undefined,
      });
    });

    window.addEventListener('unhandledrejection', (event) => {
      const reason = event.reason;
      this.log(
        'error',
        'unhandledrejection',
        reason instanceof Error ? reason.message : String(reason),
        { stack: reason instanceof Error ? reason.stack : undefined }
      );
    });
  }
}

function formatArgs(args: unknown[]): string {
  return args
    .map((arg) => {
      if (arg instanceof Error) {
        return `${arg.message}\n${arg.stack ?? ''}`.trim();
      }
      if (typeof arg === 'string') {
        return arg;
      }
      try {
        return JSON.stringify(arg);
      } catch {
        return String(arg);
      }
    })
    .join(' ');
}
