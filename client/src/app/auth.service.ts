import { computed, DestroyRef, inject, Injectable } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NotificationsService } from '@mucsi96/angular-material-theme';
import {
  LoginResponse,
  OidcSecurityService,
} from 'angular-auth-oidc-client';
import {
  catchError,
  defer,
  EMPTY,
  finalize,
  forkJoin,
  fromEvent,
  merge,
  Observable,
  of,
  shareReplay,
  switchMap,
  take,
  tap,
  throttleTime,
} from 'rxjs';

/**
 * Single owner of the OIDC session.
 *
 * Holds everything auth-related so call sites stay thin:
 *  - signal-shaped state for components (isAuthenticated, userData)
 *  - cold-start + visibilitychange/focus/online proactive refresh, because
 *    iOS freezes JS timers when the PWA is backgrounded and the library's
 *    timer-based silent renewal therefore never fires
 *  - single-flight `refresh()` - cold-start, foreground transition, the 401
 *    interceptor and the route guard all share one in-flight
 *    forceRefreshSession; running them in parallel makes
 *    angular-auth-oidc-client emit "authCallback incorrect nonce" and reset
 *    the session
 *  - `ensureAuthenticated()` - the route guard's decision, which blocks on
 *    any in-flight refresh so a route never activates with a token that's
 *    about to be replaced
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly notifications = inject(NotificationsService);
  private readonly oidc = inject(OidcSecurityService);
  private readonly destroyRef = inject(DestroyRef);

  private inFlightRefresh$: Observable<LoginResponse> | null = null;

  readonly isAuthenticated = computed(
    () => this.oidc.authenticated().isAuthenticated
  );
  readonly userData = this.oidc.userData;

  init(): void {
    this.runColdStart();

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

  login(): void {
    console.info(
      '[auth] Full re-authentication started (redirect to authority)'
    );
    this.oidc.authorize();
  }

  logout(): void {
    console.info('[auth] Logout started');
    this.oidc.logoff().subscribe({
      error: (err) => this.showError(err),
    });
  }

  /**
   * Waits for any in-flight refresh to settle before deciding whether the
   * user is authenticated, so a route never renders with a token that is
   * about to be replaced. Falls back to silent renewal (when a refresh
   * token is present) or a full authority redirect.
   */
  ensureAuthenticated(): Observable<boolean> {
    return defer(() => this.inFlightRefresh$ ?? of(null)).pipe(
      switchMap(() =>
        forkJoin({
          isAuthenticated: this.oidc.isAuthenticated(),
          refreshToken: this.oidc.getRefreshToken(),
        })
      ),
      take(1),
      switchMap(({ isAuthenticated, refreshToken }) => {
        if (isAuthenticated) {
          console.info(
            '[auth] Auth guard passed - already authenticated, no renewal needed'
          );
          return of(true);
        }

        if (!refreshToken) {
          console.info(
            '[auth] Full re-authentication started - not authenticated and no refresh token in storage'
          );
          this.oidc.authorize();
          return of(false);
        }

        console.info(
          '[auth] Not authenticated but refresh token present - attempting silent renewal before full re-authentication',
          JSON.stringify({ refreshTokenLength: refreshToken.length })
        );
        return this.refresh('guard-silent-renew').pipe(
          switchMap((result) => {
            if (result?.isAuthenticated) {
              console.info(
                '[auth] Silent renewal recovered the session - skipping full re-authentication'
              );
              return of(true);
            }
            console.warn(
              '[auth] Full re-authentication started - silent renewal did not authenticate'
            );
            this.oidc.authorize();
            return of(false);
          }),
          catchError((error: unknown) => {
            console.warn(
              '[auth] Full re-authentication started - silent renewal failed',
              JSON.stringify({
                error: error instanceof Error ? error.message : String(error),
              })
            );
            this.oidc.authorize();
            return of(false);
          })
        );
      })
    );
  }

  /**
   * Single-flight forceRefreshSession. Concurrent callers join the same
   * in-flight Observable; a fresh refresh starts on the next call once the
   * previous one has settled.
   */
  refresh(reason: string): Observable<LoginResponse> {
    if (this.inFlightRefresh$) {
      console.info(
        '[auth] Refresh requested while another is in flight - joining',
        JSON.stringify({ reason })
      );
      return this.inFlightRefresh$;
    }

    console.info('[auth] Refresh starting', JSON.stringify({ reason }));
    this.inFlightRefresh$ = this.oidc.forceRefreshSession().pipe(
      finalize(() => {
        this.inFlightRefresh$ = null;
      }),
      shareReplay({ bufferSize: 1, refCount: false })
    );
    return this.inFlightRefresh$;
  }

  private runColdStart(): void {
    const url = new URL(window.location.href);
    const returnedFromAuthority =
      url.searchParams.has('code') || url.searchParams.has('error');

    forkJoin({
      isAuthenticated: this.oidc.isAuthenticated(),
      refreshToken: this.oidc.getRefreshToken(),
      accessToken: this.oidc.getAccessToken(),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(({ isAuthenticated, refreshToken, accessToken }) => {
        const hasRefreshToken = !!refreshToken;
        const hasAccessToken = !!accessToken;

        console.info(
          `[auth] Cold start - ${
            hasRefreshToken
              ? 'refresh token present in storage'
              : 'no refresh token in storage'
          }`,
          JSON.stringify({
            isAuthenticated,
            hasRefreshToken,
            hasAccessToken,
            refreshTokenLength: refreshToken?.length ?? 0,
            returnedFromAuthority,
            displayMode: window.matchMedia?.('(display-mode: standalone)')
              .matches
              ? 'standalone'
              : 'browser',
            storage: snapshotStorageKeys(),
          })
        );

        if (returnedFromAuthority) {
          console.info(
            '[auth] Cold start - skipping proactive refresh, OIDC library is completing the authority redirect'
          );
          return;
        }

        if (!hasRefreshToken) {
          // ensureAuthenticated handles the no-refresh-token path (full re-auth)
          return;
        }

        console.info(
          '[auth] Cold start - proactively refreshing access token using stored refresh token'
        );
        this.refresh('cold-start')
          .pipe(
            tap((result) =>
              console.info(
                '[auth] Cold start proactive token refresh completed',
                JSON.stringify({
                  isAuthenticated: result?.isAuthenticated ?? false,
                  hasAccessToken: !!result?.accessToken,
                })
              )
            ),
            catchError((error: unknown) => {
              console.error(
                '[auth] Cold start proactive token refresh failed',
                JSON.stringify({
                  error: error instanceof Error ? error.message : String(error),
                })
              );
              return EMPTY;
            }),
            takeUntilDestroyed(this.destroyRef)
          )
          .subscribe();
      });
  }

  private runForegroundRefresh(): void {
    if (document.visibilityState !== 'visible') {
      return;
    }

    forkJoin({
      isAuthenticated: this.oidc.isAuthenticated(),
      refreshToken: this.oidc.getRefreshToken(),
      accessToken: this.oidc.getAccessToken(),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(({ isAuthenticated, refreshToken, accessToken }) => {
        const hasRefreshToken = !!refreshToken;
        const hasAccessToken = !!accessToken;

        console.info(
          `[auth] App returned to foreground - refresh token ${
            hasRefreshToken ? 'present in storage' : 'not in storage'
          }`,
          JSON.stringify({
            isAuthenticated,
            hasRefreshToken,
            hasAccessToken,
            refreshTokenLength: refreshToken?.length ?? 0,
            // If iOS evicted the storage the whole OIDC entry disappears, not
            // just the refresh token - the surviving key names reveal which.
            storage: snapshotStorageKeys(),
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
            tap((result) =>
              console.info(
                '[auth] Proactive foreground token refresh completed',
                JSON.stringify({
                  isAuthenticated: result?.isAuthenticated ?? false,
                  hasAccessToken: !!result?.accessToken,
                })
              )
            ),
            catchError((error: unknown) => {
              console.error(
                '[auth] Proactive foreground token refresh failed',
                JSON.stringify({
                  error: error instanceof Error ? error.message : String(error),
                })
              );
              return EMPTY;
            }),
            takeUntilDestroyed(this.destroyRef)
          )
          .subscribe();
      });
  }

  private showError(error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    this.notifications.error('An error occurred. ' + message);
  }
}

/**
 * Snapshots which keys currently live in local/session storage (names only,
 * never values). When iOS reclaims storage for a backgrounded PWA the OIDC
 * entry vanishes entirely, so a shrinking/empty key list across foreground
 * events is the fingerprint of eviction rather than a normal token expiry.
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
