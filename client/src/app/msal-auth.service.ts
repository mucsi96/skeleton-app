import { inject, Injectable, signal } from '@angular/core';
import {
  BrowserCacheLocation,
  LogLevel,
  PublicClientApplication,
} from '@azure/msal-browser';
import { ENVIRONMENT_CONFIG } from './environment/environment.config';
import { AuthService } from './auth.service';

@Injectable()
export class MsalAuthService extends AuthService {
  private readonly config = inject(ENVIRONMENT_CONFIG);
  readonly msalInstance = new PublicClientApplication({
    auth: {
      clientId: this.config.clientId,
      authority: `https://login.microsoftonline.com/${this.config.tenantId}`,
      redirectUri: '/',
      postLogoutRedirectUri: '/',
    },
    cache: {
      cacheLocation: BrowserCacheLocation.SessionStorage,
    },
    system: {
      allowPlatformBroker: false,
      loggerOptions: {
        loggerCallback: (_level: LogLevel, message: string) =>
          console.log(message),
        logLevel: LogLevel.Info,
        piiLoggingEnabled: false,
      },
    },
  });

  readonly isAuthenticated = signal(false);
  private token = '';

  private getApiScopes(): string[] {
    return [
      `${this.config.apiClientId}/readGreetings`,
      `${this.config.apiClientId}/createGreeting`,
    ];
  }

  async login(): Promise<void> {
    await this.msalInstance.initialize();

    const result = await this.msalInstance.handleRedirectPromise();
    if (result?.account) {
      this.msalInstance.setActiveAccount(result.account);
      const tokenResult = await this.msalInstance.acquireTokenSilent({
        scopes: this.getApiScopes(),
        account: result.account,
      });
      this.token = tokenResult.accessToken;
      this.isAuthenticated.set(true);
      return;
    }

    const accounts = this.msalInstance.getAllAccounts();
    if (accounts.length > 0) {
      this.msalInstance.setActiveAccount(accounts[0]);
      const tokenResult = await this.msalInstance.acquireTokenSilent({
        scopes: this.getApiScopes(),
        account: accounts[0],
      });
      this.token = tokenResult.accessToken;
      this.isAuthenticated.set(true);
      return;
    }

    await this.msalInstance.loginRedirect({
      scopes: this.getApiScopes(),
    });
  }

  getToken(): string {
    return this.token;
  }
}
