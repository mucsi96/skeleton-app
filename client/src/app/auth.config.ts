import {
  EnvironmentProviders,
  inject,
  makeEnvironmentProviders,
  provideAppInitializer,
} from '@angular/core';
import {
  AbstractSecurityStorage,
  DefaultLocalStorageService,
  EventTypes,
  LogLevel,
  OidcClientNotification,
  provideAuth,
  PublicEventsService,
  withAppInitializerAuthCheck,
} from 'angular-auth-oidc-client';
import { EnvironmentConfig } from './environment/environment.config';

export function provideOidcAuth(config: EnvironmentConfig): EnvironmentProviders {
  if (config.mockOAuth2ServerUri) {
    return provideMockOidcConfig(config);
  }

  return provideAzureAdOidcConfig(config);
}

function provideAzureAdOidcConfig(config: EnvironmentConfig): EnvironmentProviders {
  return makeEnvironmentProviders([
    provideAuthEventLogging(),
    provideAuth(
      {
        config: {
          authority: `https://login.microsoftonline.com/${config.tenantId}/v2.0`,
          authWellknownEndpointUrl: `https://login.microsoftonline.com/${config.tenantId}/v2.0`,
          redirectUrl: window.location.origin,
          postLogoutRedirectUri: window.location.origin,
          clientId: config.clientId,
          scope: `openid profile offline_access ${config.apiClientId}/readGreetings ${config.apiClientId}/createGreeting`,
          responseType: 'code',
          silentRenew: true,
          useRefreshToken: true,
          renewTimeBeforeTokenExpiresInSeconds: 60,
          autoUserInfo: false,
          disableIatOffsetValidation: true,
          // Refresh-token flow returns a new ID token without a fresh nonce
          // (no new authorize call). With autoCleanStateAfterAuthentication
          // the original nonce is also gone, so validating against it always
          // fails with IncorrectNonce - resetting the session and blanking
          // the avatar when the iPhone PWA resumes from background.
          ignoreNonceAfterRefresh: true,
          logLevel: LogLevel.Warn,
          secureRoutes: ['/api'],
        },
      },
      withAppInitializerAuthCheck()
    ),
    { provide: AbstractSecurityStorage, useClass: DefaultLocalStorageService },
  ]);
}

function provideMockOidcConfig(config: EnvironmentConfig): EnvironmentProviders {
  return makeEnvironmentProviders([
    provideAuthEventLogging(),
    provideAuth(
      {
        config: {
          authority: `${config.mockOAuth2ServerUri}/default`,
          redirectUrl: window.location.origin,
          postLogoutRedirectUri: window.location.origin,
          clientId: 'mock-client-id',
          scope: 'openid profile',
          responseType: 'code',
          silentRenew: false,
          autoUserInfo: false,
          logLevel: LogLevel.Warn,
          secureRoutes: ['/api'],
        },
      },
      withAppInitializerAuthCheck()
    ),
    { provide: AbstractSecurityStorage, useClass: DefaultLocalStorageService },
  ]);
}

/**
 * Subscribes to angular-auth-oidc-client's event stream as an app initializer
 * so the subscription is live *before* withAppInitializerAuthCheck fires its
 * bootstrap renew. That renew is the prime suspect for the silent
 * resetAuthDataInStore() that empties authnResult (proven via auth.service's
 * inspectOidcStorage: the blob survives but the tokens slot is gone). The
 * library's own timer/bootstrap silent renew runs independently of
 * AuthService.refresh(), so without this hook its failures - and the
 * AADSTS/network error that caused them - go unlogged.
 *
 * Logs structure only (event names, validation results, error status and
 * AADSTS description), never a token.
 */
function provideAuthEventLogging(): EnvironmentProviders {
  return provideAppInitializer(() => {
    const events = inject(PublicEventsService);
    events.registerForEvents().subscribe((event) => logAuthEvent(event));
  });
}

function logAuthEvent(event: OidcClientNotification<unknown>): void {
  switch (event.type) {
    case EventTypes.SilentRenewStarted:
      console.info('[auth] OIDC silent renew started');
      break;
    case EventTypes.SilentRenewFailed:
      console.warn(
        '[auth] OIDC silent renew failed - library resets authnResult on this path',
        JSON.stringify({ error: describeAuthError(event.value) })
      );
      break;
    case EventTypes.NewAuthenticationResult:
      console.info(
        '[auth] OIDC authentication result',
        JSON.stringify(describeAuthResult(event.value))
      );
      break;
    case EventTypes.TokenExpired:
    case EventTypes.IdTokenExpired:
      console.info(`[auth] OIDC ${EventTypes[event.type]}`);
      break;
    default:
      break;
  }
}

/**
 * Pulls the diagnostic fields out of a NewAuthenticationResult value without
 * touching the tokens it may carry. validationResult is the gold here - it
 * names *why* a renew was rejected (e.g. TokenExpired, IncorrectNonce,
 * SignatureFailed).
 */
function describeAuthResult(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object') {
    return { value: typeof value };
  }
  const result = value as Record<string, unknown>;
  return {
    isAuthenticated: result['isAuthenticated'] ?? null,
    isRenewProcess: result['isRenewProcess'] ?? null,
    validationResult: result['validationResult'] ?? null,
  };
}

/**
 * Extracts a safe, human-readable cause from a renew error. For an Azure token
 * endpoint rejection this surfaces the HTTP status plus the OAuth error /
 * error_description (the AADSTS code) - the response body never contains the
 * refresh token, so this leaks nothing sensitive.
 */
function describeAuthError(value: unknown): Record<string, unknown> {
  if (value instanceof Error) {
    return { message: value.message };
  }
  if (value && typeof value === 'object') {
    const error = value as Record<string, unknown>;
    const body = error['error'];
    let detail: string | undefined;
    if (body && typeof body === 'object') {
      const oauthError = body as Record<string, unknown>;
      detail =
        [oauthError['error'], oauthError['error_description']]
          .filter((part) => typeof part === 'string')
          .join(': ') || undefined;
    } else if (typeof body === 'string') {
      detail = body;
    }
    return {
      status: error['status'] ?? null,
      statusText: error['statusText'] ?? null,
      detail,
    };
  }
  return { value: String(value) };
}
