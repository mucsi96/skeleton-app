import { APP_INITIALIZER } from '@angular/core';
import { AuthService } from './auth.service';
import { MsalAuthService } from './msal-auth.service';

export function provideMsalAuth() {
  return [
    { provide: AuthService, useClass: MsalAuthService },
    {
      provide: APP_INITIALIZER,
      useFactory: (auth: AuthService) => () => auth.login(),
      deps: [AuthService],
      multi: true,
    },
  ];
}
