import { DestroyRef, inject, Injectable } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { OidcSecurityService } from 'angular-auth-oidc-client';
import { fromEvent, merge, throttleTime } from 'rxjs';

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
          this.oidcSecurityService
            .forceRefreshSession()
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe();
        }
      });
  }
}
