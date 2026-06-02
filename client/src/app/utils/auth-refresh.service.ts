import { inject, Injectable } from '@angular/core';
import { LoginResponse, OidcSecurityService } from 'angular-auth-oidc-client';
import { finalize, Observable, shareReplay } from 'rxjs';

/**
 * Serializes calls to OidcSecurityService.forceRefreshSession().
 *
 * On cold start two refreshes can fire within a few hundred milliseconds: the
 * proactive cold-start refresh kicked off by TokenRenewalService, and the
 * 401-retry refresh from the very first API call (which already went out with
 * the stale token before the cold-start refresh finished). Running them in
 * parallel makes angular-auth-oidc-client emit an "authCallback incorrect
 * nonce" warning and reset the session entirely.
 *
 * Every caller that wants a fresh token goes through `refresh()`. If a
 * refresh is already in flight the second caller subscribes to the same
 * Observable and shares its result, otherwise a new refresh is started.
 */
@Injectable({ providedIn: 'root' })
export class AuthRefreshService {
  private readonly oidc = inject(OidcSecurityService);
  private inFlight$: Observable<LoginResponse> | null = null;

  refresh(reason: string): Observable<LoginResponse> {
    if (this.inFlight$) {
      console.info(
        '[auth] Refresh requested while another is in flight - joining',
        JSON.stringify({ reason })
      );
      return this.inFlight$;
    }

    console.info(
      '[auth] Refresh starting',
      JSON.stringify({ reason })
    );

    this.inFlight$ = this.oidc.forceRefreshSession().pipe(
      finalize(() => {
        this.inFlight$ = null;
      }),
      shareReplay({ bufferSize: 1, refCount: false })
    );
    return this.inFlight$;
  }
}
