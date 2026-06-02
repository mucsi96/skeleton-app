import { DestroyRef, inject, Injectable } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { OidcSecurityService } from 'angular-auth-oidc-client';
import { catchError, EMPTY, forkJoin, fromEvent, merge, tap, throttleTime } from 'rxjs';
import { AuthRefreshService } from './auth-refresh.service';

/**
 * Keeps the access token fresh on mobile.
 *
 * `angular-auth-oidc-client` schedules silent renewal on a JS timer, but iOS
 * freezes timers (and the whole page) while the app is backgrounded - which on
 * a phone is most of the time. The scheduled renewal therefore never fires and
 * the user returns to an expired token and a forced re-login.
 *
 * This service renews proactively on two triggers:
 *   1. Cold start - because iOS PWA frequently kills the page when backgrounded
 *      and every "reopen" is actually a fresh load with a stale access token.
 *   2. visibilitychange/focus/online - when the page is kept alive but
 *      backgrounded, this catches the moment iOS un-freezes timers.
 *
 * Either way the next API request goes out with a token that was just minted,
 * so the hourly access-token expiry stops being noticeable.
 */
@Injectable({ providedIn: 'root' })
export class TokenRenewalService {
  private readonly oidcSecurityService = inject(OidcSecurityService);
  private readonly authRefresh = inject(AuthRefreshService);
  private readonly destroyRef = inject(DestroyRef);

  init(): void {
    this.renewOnColdStart();

    const visible$ = fromEvent(document, 'visibilitychange');
    const focus$ = fromEvent(window, 'focus');
    const online$ = fromEvent(window, 'online');

    merge(visible$, focus$, online$)
      .pipe(
        throttleTime(30_000, undefined, { leading: true, trailing: false }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(() => this.renewIfForeground());
  }

  /**
   * Snapshots the boot-time auth state and, if there is something to refresh
   * with, proactively mints a new access token. iOS PWA cold starts are
   * frequent (the page is killed every time the user backgrounds it) and the
   * library's checkAuth happily restores a session backed by a near-expired
   * access token, so without this step the very next API call risks a 401.
   *
   * Skipped while the OIDC library is completing an authority redirect - the
   * code exchange in checkAuth must not race with a parallel refresh.
   */
  private renewOnColdStart(): void {
    const url = new URL(window.location.href);
    const returnedFromAuthority =
      url.searchParams.has('code') || url.searchParams.has('error');

    forkJoin({
      isAuthenticated: this.oidcSecurityService.isAuthenticated(),
      refreshToken: this.oidcSecurityService.getRefreshToken(),
      accessToken: this.oidcSecurityService.getAccessToken(),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(({ isAuthenticated, refreshToken, accessToken }) => {
        const hasRefreshToken = !!refreshToken;
        const hasAccessToken = !!accessToken;

        console.info(
          `[auth] Cold start - ${
            hasRefreshToken ? 'refresh token present in storage' : 'no refresh token in storage'
          }`,
          JSON.stringify({
            isAuthenticated,
            hasRefreshToken,
            hasAccessToken,
            refreshTokenLength: refreshToken?.length ?? 0,
            returnedFromAuthority,
            displayMode:
              window.matchMedia?.('(display-mode: standalone)').matches
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
          // authGuard handles the no-refresh-token branch (full re-auth)
          return;
        }

        console.info(
          '[auth] Cold start - proactively refreshing access token using stored refresh token'
        );
        this.authRefresh
          .refresh('cold-start')
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

  private renewIfForeground(): void {
    if (document.visibilityState !== 'visible') {
      return;
    }

    forkJoin({
      isAuthenticated: this.oidcSecurityService.isAuthenticated(),
      refreshToken: this.oidcSecurityService.getRefreshToken(),
      accessToken: this.oidcSecurityService.getAccessToken(),
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
        this.authRefresh
          .refresh('foreground')
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
