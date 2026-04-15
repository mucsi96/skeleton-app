import { inject, Injectable, signal } from '@angular/core';
import { ENVIRONMENT_CONFIG } from './environment/environment.config';
import { AuthService } from './auth.service';

@Injectable()
export class MockAuthService extends AuthService {
  private readonly config = inject(ENVIRONMENT_CONFIG);

  readonly isAuthenticated = signal(false);
  private token = '';

  async login(): Promise<void> {
    const response = await fetch(
      `${this.config.mockOAuthBaseUrl}/default/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'grant_type=client_credentials&client_id=test-client&scope=openid',
      }
    );

    if (!response.ok) {
      throw new Error(`Mock OAuth token request failed: ${response.status}`);
    }

    const data = await response.json();
    this.token = data.access_token;
    this.isAuthenticated.set(true);
  }

  getToken(): string {
    return this.token;
  }
}
