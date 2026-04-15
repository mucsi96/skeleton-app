import { effect, inject, Injectable, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatSnackBar } from '@angular/material/snack-bar';
import { OidcSecurityService } from 'angular-auth-oidc-client';
import { map } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly snackBar = inject(MatSnackBar);
  private readonly oidcSecurityService = inject(OidcSecurityService);

  readonly isAuthenticated = signal(false);

  private readonly authResult = toSignal(
    this.oidcSecurityService.isAuthenticated$.pipe(
      map(({ isAuthenticated }) => isAuthenticated)
    )
  );

  readonly userData = toSignal(this.oidcSecurityService.userData$);

  constructor() {
    effect(() => {
      const authenticated = this.authResult();
      if (authenticated !== undefined) {
        this.isAuthenticated.set(authenticated);
      }
    });
  }

  login(): void {
    this.oidcSecurityService.authorize();
  }

  logout(): void {
    this.oidcSecurityService
      .logoff()
      .subscribe({
        error: (err) => this.showError(err),
      });
  }

  private showError(error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    this.snackBar.open('An error occurred. ' + message, 'Close', {
      duration: 3000,
      verticalPosition: 'top',
      panelClass: ['error'],
    });
  }
}
