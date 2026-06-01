import { inject, Injectable } from '@angular/core';
import {
  EventTypes,
  OidcClientNotification,
  PublicEventsService,
} from 'angular-auth-oidc-client';
import { ClientLogLevel, LoggerService } from './logger.service';

/**
 * Logs the full OIDC authentication lifecycle to the backend so it is possible
 * to follow exactly when the access token is silently renewed via the refresh
 * token versus when a full interactive re-authentication is required.
 *
 * Subscribe before the OIDC app-initializer auth check runs so the very first
 * events (config load, initial auth check) are captured too.
 */
@Injectable({ providedIn: 'root' })
export class AuthLoggingService {
  private readonly events = inject(PublicEventsService);
  private readonly logger = inject(LoggerService);

  init(): void {
    this.events
      .registerForEvents()
      .subscribe((notification) => this.handle(notification));
  }

  private handle(notification: OidcClientNotification<unknown>): void {
    const eventName = EventTypes[notification.type] ?? `Unknown(${notification.type})`;
    const { level, message } = describe(eventName);

    this.logger.log(level, 'auth', message, {
      eventType: eventName,
      value: redactTokens(notification.value),
    });
  }
}

function describe(eventName: string): {
  level: ClientLogLevel;
  message: string;
} {
  switch (eventName) {
    case 'ConfigLoaded':
      return { level: 'info', message: 'OIDC configuration loaded' };
    case 'ConfigLoadingFailed':
      return { level: 'error', message: 'OIDC configuration loading failed' };
    case 'CheckingAuth':
      return { level: 'info', message: 'Checking authentication state' };
    case 'CheckingAuthFinished':
      return { level: 'info', message: 'Authentication check finished' };
    case 'CheckingAuthFinishedWithError':
      return {
        level: 'error',
        message: 'Authentication check finished with error',
      };
    case 'CheckSessionReceived':
      return {
        level: 'debug',
        message: 'Check session event received from authority',
      };
    case 'UserDataChanged':
      return { level: 'info', message: 'User data changed' };
    case 'NewAuthenticationResult':
      return { level: 'info', message: 'New authentication result processed' };
    case 'TokenExpired':
      return { level: 'warn', message: 'Access token expired' };
    case 'IdTokenExpired':
      return { level: 'warn', message: 'ID token expired' };
    case 'SilentRenewStarted':
      return {
        level: 'info',
        message: 'Silent token renewal started (refresh token flow)',
      };
    case 'SilentRenewFailed':
      return {
        level: 'error',
        message:
          'Silent token renewal failed - full re-authentication will be required',
      };
    default:
      return { level: 'info', message: `Auth event: ${eventName}` };
  }
}

function redactTokens(value: unknown): unknown {
  if (!value || typeof value !== 'object') {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, val]) => [
      key,
      /token|secret|password|code/i.test(key) ? '[REDACTED]' : val,
    ])
  );
}
