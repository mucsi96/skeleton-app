import { inject, Injectable } from '@angular/core';
import {
  EventTypes,
  OidcSecurityService,
  PublicEventsService,
} from 'angular-auth-oidc-client';
import { filter } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class AuthRenewService {
  private readonly events = inject(PublicEventsService);
  private readonly oidcSecurityService = inject(OidcSecurityService);
  private redirecting = false;

  start(): void {
    this.events
      .registerForEvents()
      .pipe(
        filter(
          ({ type }) =>
            type === EventTypes.SilentRenewFailed ||
            type === EventTypes.CheckingAuthFinishedWithError
        )
      )
      .subscribe(() => this.forceReauthorize());
  }

  forceReauthorize(): void {
    if (this.redirecting) {
      return;
    }
    this.redirecting = true;
    this.oidcSecurityService.authorize();
  }
}
