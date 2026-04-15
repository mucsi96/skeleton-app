import { HttpClient } from '@angular/common/http';
import { Injectable, inject, resource } from '@angular/core';
import { fetchJson } from './utils/fetchJson';
import { ENVIRONMENT_CONFIG } from './environment/environment.config';
import { AuthService } from './auth.service';
import { MsalAuthService } from './msal-auth.service';

@Injectable({
  providedIn: 'root',
})
export class UserProfileService {
  private readonly http = inject(HttpClient);
  private readonly config = inject(ENVIRONMENT_CONFIG);
  private readonly authService = inject(AuthService);

  profile = resource<{ name: string; initials: string } | undefined, {}>({
    loader: async () => {
      if (this.config.mockAuth) {
        return { name: 'Test User', initials: 'TU' };
      }

      try {
        const msalAuth = this.authService as MsalAuthService;
        const account = msalAuth.msalInstance.getActiveAccount();
        if (!account) return;

        const tokenResult = await msalAuth.msalInstance.acquireTokenSilent({
          scopes: ['user.read'],
          account,
        });

        const { displayName } = await fetchJson<{ displayName: string }>(
          this.http,
          'https://graph.microsoft.com/v1.0/me',
          { headers: { Authorization: `Bearer ${tokenResult.accessToken}` } }
        );
        return {
          name: displayName,
          initials: this.getInitials(displayName),
        };
      } catch (error) {
        return;
      }
    },
  });

  private getInitials(name: string | undefined): string {
    if (!name) return '';
    const initials = name
      .split(' ')
      .map((n) => n[0])
      .join('');
    return initials.toUpperCase();
  }
}
