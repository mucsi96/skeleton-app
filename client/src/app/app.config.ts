import { APP_INITIALIZER, ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';

import {
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import {
  MAT_RIPPLE_GLOBAL_OPTIONS,
  RippleGlobalOptions,
} from '@angular/material/core';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { routes } from './app.routes';
import { errorInterceptor } from './utils/error.interceptor';
import { timezoneInterceptor } from './utils/timezone.interceptor';
import { authInterceptor } from './utils/auth.interceptor';
import { provideMsalAuth } from './msal.config';
import { AuthService } from './auth.service';
import { MockAuthService } from './mock-auth.service';
import {
  EnvironmentConfig,
  ENVIRONMENT_CONFIG,
} from './environment/environment.config';

const globalRippleConfig: RippleGlobalOptions = {
  disabled: true,
};

function provideMockAuth() {
  return [
    { provide: AuthService, useClass: MockAuthService },
    {
      provide: APP_INITIALIZER,
      useFactory: (auth: AuthService) => () => auth.login(),
      deps: [AuthService],
      multi: true,
    },
  ];
}

export function getAppConfig(environment: EnvironmentConfig): ApplicationConfig {
  return {
    providers: [
      provideZoneChangeDetection({ eventCoalescing: true }),
      provideRouter(routes),
      provideHttpClient(
        withInterceptors([authInterceptor, timezoneInterceptor, errorInterceptor])
      ),
      { provide: MAT_RIPPLE_GLOBAL_OPTIONS, useValue: globalRippleConfig },
      provideAnimationsAsync(),
      { provide: ENVIRONMENT_CONFIG, useValue: environment },
      ...(environment.mockAuth ? provideMockAuth() : provideMsalAuth()),
    ],
  };
}
