import { DestroyRef, inject, Injectable } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { OidcSecurityService } from 'angular-auth-oidc-client';
import { catchError, EMPTY, fromEvent, merge, tap, throttleTime } from 'rxjs';
import { LoggerService } from './logger.service';

/**
 * Keeps the access token fresh on mobile.
 *
 * `angular-auth-oidc-client` schedules silent renewal on a JS timer, but iOS
 * freezes timers (and the whole page) while the app is backgrounded - which on
 * a phone is most of the time. The scheduled renewal therefore never fires and
 * the user returns to an expired token and a forced re-login.
 *
 * This service renews proactively whenever the app comes back to the
 * foreground (the moment iOS un-freezes the page and the user is about to make
 * a request anyway), so the hourly access-token expiry stops being noticeable.
 */
@Injectable({ providedIn: 'root' })
export class TokenRenewalService {
  private readonly oidcSecurityService = inject(OidcSecurityService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly logger = inject(LoggerService);

  init(): void {
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

  private renewIfForeground(): void {
    if (document.visibilityState !== 'visible') {
      return;
    }

    this.oidcSecurityService
      .isAuthenticated()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((isAuthenticated) => {
        if (isAuthenticated) {
          this.logger.log(
            'info',
            'auth',
            'App returned to foreground - proactively refreshing access token via refresh token'
          );
          this.oidcSecurityService
            .forceRefreshSession()
            .pipe(
              tap(() =>
                this.logger.log(
                  'info',
                  'auth',
                  'Proactive foreground token refresh completed'
                )
              ),
              catchError((error: unknown) => {
                this.logger.log(
                  'error',
                  'auth',
                  'Proactive foreground token refresh failed',
                  {
                    error: error instanceof Error ? error.message : String(error),
                  }
                );
                return EMPTY;
              }),
              takeUntilDestroyed(this.destroyRef)
            )
            .subscribe();
        }
      });
  }
}
