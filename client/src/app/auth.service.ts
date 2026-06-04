import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NotificationsService } from '@mucsi96/angular-material-theme';
import { User } from 'oidc-client-ts';
import {
  catchError,
  defer,
  EMPTY,
  finalize,
  from,
  fromEvent,
  merge,
  Observable,
  of,
  shareReplay,
  switchMap,
  take,
  tap,
  throttleTime,
  throwError,
} from 'rxjs';
import { USER_MANAGER } from './auth.config';
import { flushFaro } from './utils/faro';

/**
 * Single owner of the OIDC session, built on oidc-client-ts with every
 * automatic behaviour disabled (see auth.config). Call sites stay thin:
 *  - signal-shaped state for components (isAuthenticated, userData)
 *  - cold-start + visibilitychange/focus/online proactive refresh, because the
 *    library no longer runs any background renew timer (and iOS would freeze it
 *    anyway while the PWA is backgrounded)
 *  - single-flight `refresh()` - cold-start, foreground transition, the 401
 *    interceptor and the route guard share one in-flight signinSilent
 *  - `ensureAuthenticated()` - the route guard's decision, which blocks on any
 *    in-flight refresh so a route never activates with a token about to change
 *
 * Unlike the previous library, a failed signinSilent does NOT wipe the stored
 * user - we keep it so the next attempt can reuse the refresh token, and we are
 * the only code that ever removes the session.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly notifications = inject(NotificationsService);
  private readonly userManager = inject(USER_MANAGER);
  private readonly destroyRef = inject(DestroyRef);

  private readonly user = signal<User | null>(null);
  private inFlightRefresh$: Observable<User | null> | null = null;
  private returnedFromAuthority = false;

  readonly isAuthenticated = computed(() => {
    const user = this.user();
    return !!user && !user.expired;
  });
  readonly userData = computed(() => this.user()?.profile ?? null);

  /** Current access token for the bearer-token interceptor (may be expired; the 401 retry handles that). */
  getAccessToken(): string | null {
    return this.user()?.access_token ?? null;
  }

  async init(): Promise<void> {
    this.registerEventLogging();
    await this.loadInitialUser();
    this.installForegroundRefresh();
    this.runColdStartRefresh();
  }

  login(): void {
    console.info(
      '[auth] Full re-authentication started (redirect to authority)'
    );
    flushFaro();
    this.userManager.signinRedirect().catch((error) =>
      console.error(
        '[auth] signinRedirect failed',
        JSON.stringify({ error: errorMessage(error) })
      )
    );
  }

  logout(): void {
    console.info('[auth] Logout started');
    flushFaro();
    this.userManager.signoutRedirect().catch((error) => {
      // The mock provider exposes no end_session_endpoint; clear locally instead.
      console.warn(
        '[auth] signoutRedirect failed - clearing session locally',
        JSON.stringify({ error: errorMessage(error) })
      );
      this.userManager.removeUser().finally(() => {
        window.location.href = window.location.origin;
      });
    });
  }

  /**
   * Waits for any in-flight refresh to settle before deciding whether the user
   * is authenticated, so a route never renders with a token that is about to be
   * replaced. Falls back to silent renewal (when a refresh token is present) or
   * a full authority redirect.
   */
  ensureAuthenticated(): Observable<boolean> {
    return defer(() => this.inFlightRefresh$ ?? of(null)).pipe(
      switchMap(() => from(this.userManager.getUser())),
      take(1),
      switchMap((user) => {
        this.user.set(user);

        if (user && !user.expired) {
          console.info(
            '[auth] Auth guard passed - already authenticated, no renewal needed'
          );
          return of(true);
        }

        if (!user?.refresh_token) {
          console.info(
            '[auth] Full re-authentication started - not authenticated and no refresh token in storage'
          );
          this.login();
          return of(false);
        }

        console.info(
          '[auth] Not authenticated but refresh token present - attempting silent renewal before full re-authentication',
          JSON.stringify({ refreshTokenLength: user.refresh_token.length })
        );
        return this.refresh('guard-silent-renew').pipe(
          switchMap((renewed) => {
            if (renewed && !renewed.expired) {
              console.info(
                '[auth] Silent renewal recovered the session - skipping full re-authentication'
              );
              return of(true);
            }
            console.warn(
              '[auth] Full re-authentication started - silent renewal did not authenticate'
            );
            this.login();
            return of(false);
          }),
          catchError((error: unknown) => {
            console.warn(
              '[auth] Full re-authentication started - silent renewal failed',
              JSON.stringify({ error: errorMessage(error) })
            );
            this.login();
            return of(false);
          })
        );
      })
    );
  }

  /**
   * Single-flight signinSilent (refresh-token grant). Concurrent callers join
   * the same in-flight Observable; a fresh refresh starts on the next call once
   * the previous one has settled.
   */
  refresh(reason: string): Observable<User | null> {
    if (this.inFlightRefresh$) {
      console.info(
        '[auth] Refresh requested while another is in flight - joining',
        JSON.stringify({ reason })
      );
      return this.inFlightRefresh$;
    }

    console.info('[auth] Refresh starting', JSON.stringify({ reason }));
    this.inFlightRefresh$ = from(this.userManager.signinSilent()).pipe(
      tap((user) => {
        this.user.set(user);
        console.info(
          '[auth] Refresh completed',
          JSON.stringify({
            isAuthenticated: !!user && !user.expired,
            hasAccessToken: !!user?.access_token,
            hasRefreshToken: !!user?.refresh_token,
          })
        );
      }),
      catchError((error: unknown) => {
        // signinSilent leaves the stored user untouched on failure - surface
        // the error but keep the session for the next attempt / 401 retry.
        console.warn(
          '[auth] Refresh failed',
          JSON.stringify({ reason, error: errorMessage(error) })
        );
        return throwError(() => error);
      }),
      finalize(() => {
        this.inFlightRefresh$ = null;
      }),
      shareReplay({ bufferSize: 1, refCount: false })
    );
    return this.inFlightRefresh$;
  }

  private registerEventLogging(): void {
    const events = this.userManager.events;
    events.addUserLoaded((user) => {
      this.user.set(user);
      console.info('[auth] User loaded', JSON.stringify(describeUser(user)));
    });
    events.addUserUnloaded(() => {
      this.user.set(null);
      console.info('[auth] User unloaded - session removed from storage');
    });
    events.addAccessTokenExpiring(() =>
      console.info('[auth] Access token expiring')
    );
    events.addAccessTokenExpired(() =>
      console.warn('[auth] Access token expired')
    );
    events.addSilentRenewError((error) =>
      console.warn(
        '[auth] Silent renew error',
        JSON.stringify({ error: errorMessage(error) })
      )
    );
  }

  private async loadInitialUser(): Promise<void> {
    const url = new URL(window.location.href);
    this.returnedFromAuthority =
      url.searchParams.has('code') || url.searchParams.has('error');

    if (this.returnedFromAuthority) {
      try {
        const user = await this.userManager.signinRedirectCallback();
        this.user.set(user);
        console.info(
          '[auth] Cold start - redirect callback processed',
          JSON.stringify({ ...describeUser(user), storage: snapshotStorageKeys() })
        );
      } catch (error) {
        console.error(
          '[auth] Cold start - redirect callback failed',
          JSON.stringify({ error: errorMessage(error) })
        );
      }
      // Strip the auth params so refreshes and deep links stay clean.
      history.replaceState(history.state, '', url.origin + url.pathname);
      return;
    }

    const user = await this.userManager.getUser();
    this.user.set(user);
    const hasRefreshToken = !!user?.refresh_token;
    console.info(
      `[auth] Cold start - ${
        hasRefreshToken
          ? 'refresh token present in storage'
          : 'no refresh token in storage'
      }`,
      JSON.stringify({
        isAuthenticated: !!user && !user.expired,
        hasRefreshToken,
        hasAccessToken: !!user?.access_token,
        refreshTokenLength: user?.refresh_token?.length ?? 0,
        returnedFromAuthority: false,
        displayMode: displayMode(),
        storage: snapshotStorageKeys(),
        oidcStorage: inspectOidcStorage(),
      })
    );
  }

  private runColdStartRefresh(): void {
    if (this.returnedFromAuthority) {
      // The callback already produced a fresh token; nothing to renew.
      return;
    }
    if (!this.user()?.refresh_token) {
      // ensureAuthenticated handles the no-refresh-token path (full re-auth).
      return;
    }
    console.info(
      '[auth] Cold start - proactively refreshing access token using stored refresh token'
    );
    this.refresh('cold-start')
      .pipe(
        catchError(() => EMPTY),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe();
  }

  private installForegroundRefresh(): void {
    merge(
      fromEvent(document, 'visibilitychange'),
      fromEvent(window, 'focus'),
      fromEvent(window, 'online')
    )
      .pipe(
        throttleTime(30_000, undefined, { leading: true, trailing: false }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(() => this.runForegroundRefresh());
  }

  private runForegroundRefresh(): void {
    if (document.visibilityState !== 'visible') {
      return;
    }

    this.userManager.getUser().then((user) => {
      this.user.set(user);
      const hasRefreshToken = !!user?.refresh_token;

      console.info(
        `[auth] App returned to foreground - refresh token ${
          hasRefreshToken ? 'present in storage' : 'not in storage'
        }`,
        JSON.stringify({
          isAuthenticated: !!user && !user.expired,
          hasRefreshToken,
          hasAccessToken: !!user?.access_token,
          refreshTokenLength: user?.refresh_token?.length ?? 0,
          storage: snapshotStorageKeys(),
          oidcStorage: inspectOidcStorage(),
        })
      );

      if (!hasRefreshToken) {
        console.warn(
          '[auth] App returned to foreground with no refresh token in storage - silent renewal impossible, full re-authentication will be required'
        );
        return;
      }

      console.info(
        '[auth] Proactively refreshing access token using stored refresh token'
      );
      this.refresh('foreground')
        .pipe(
          catchError(() => EMPTY),
          takeUntilDestroyed(this.destroyRef)
        )
        .subscribe();
    });
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function displayMode(): 'standalone' | 'browser' {
  return window.matchMedia?.('(display-mode: standalone)').matches
    ? 'standalone'
    : 'browser';
}

function describeUser(user: User | null): Record<string, unknown> {
  return {
    isAuthenticated: !!user && !user.expired,
    hasAccessToken: !!user?.access_token,
    hasRefreshToken: !!user?.refresh_token,
    refreshTokenLength: user?.refresh_token?.length ?? 0,
    expiresAt: user?.expires_at ?? null,
  };
}

/**
 * Snapshots which keys currently live in local/session storage (names only,
 * never values). The presence of the oidc-client-ts user key is the first
 * discriminator between the two ways a session goes missing: iOS reclaiming
 * storage drops the key entirely, whereas a deliberate removeUser leaves no
 * `oidc.user:*` key but other keys may remain.
 */
function snapshotStorageKeys(): {
  localStorageKeys: string[];
  sessionStorageKeys: string[];
} {
  const keysOf = (store: Storage): string[] => {
    try {
      return Object.keys(store);
    } catch {
      return ['<unavailable>'];
    }
  };
  return {
    localStorageKeys: keysOf(localStorage),
    sessionStorageKeys: keysOf(sessionStorage),
  };
}

/**
 * Inspects the oidc-client-ts user blob - structure only, never secret values.
 * The library persists the session as a single localStorage entry keyed
 * `oidc.user:<authority>:<client_id>` whose value is the serialized User
 * (access_token, id_token, refresh_token, profile, expires_at, ...).
 *
 * Because nothing in this app wipes the user automatically, a missing blob now
 * unambiguously means either we called removeUser or iOS evicted storage -
 * reported here alongside token lengths so the cause is visible in the logs.
 */
function inspectOidcStorage(): {
  blobPresent: boolean;
  blobKey: string | null;
  blobByteLength: number;
  topLevelKeys: string[];
  accessTokenLength: number;
  refreshTokenLength: number;
  idTokenLength: number;
} {
  let blobKey: string | null = null;
  let blobRaw = '';
  let parsed: Record<string, unknown> | null = null;

  try {
    for (const key of Object.keys(localStorage)) {
      if (!key.startsWith('oidc.user:')) {
        continue;
      }
      const raw = localStorage.getItem(key);
      if (!raw) {
        continue;
      }
      blobKey = key;
      blobRaw = raw;
      try {
        parsed = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        parsed = null;
      }
      break;
    }
  } catch {
    // localStorage can throw entirely under locked-down iOS privacy modes.
  }

  const tokenLength = (name: string): number => {
    const value = parsed?.[name];
    return typeof value === 'string' ? value.length : 0;
  };

  return {
    blobPresent: blobKey !== null,
    blobKey,
    blobByteLength: blobRaw.length,
    topLevelKeys: parsed ? Object.keys(parsed) : [],
    accessTokenLength: tokenLength('access_token'),
    refreshTokenLength: tokenLength('refresh_token'),
    idTokenLength: tokenLength('id_token'),
  };
}
