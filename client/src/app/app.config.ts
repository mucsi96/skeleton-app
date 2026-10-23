import {
  ApplicationConfig,
  provideZoneChangeDetection,
} from '@angular/core';
import { provideRouter } from '@angular/router';

import {
  provideHttpClient,
  withInterceptors,
  withXsrfConfiguration,
} from '@angular/common/http';
import {
  MAT_RIPPLE_GLOBAL_OPTIONS,
  RippleGlobalOptions,
} from '@angular/material/core';
import { provideAngularMaterialTheme } from '@mucsi96/angular-material-theme';
import { routes } from './app.routes';
import { errorInterceptor } from './utils/error.interceptor';
import { timezoneInterceptor } from './utils/timezone.interceptor';

const globalRippleConfig: RippleGlobalOptions = {
  disabled: true,
};

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideHttpClient(
      withXsrfConfiguration({ cookieName: '__Host-XSRF-TOKEN' }),
      withInterceptors([
        errorInterceptor,
        timezoneInterceptor,
      ])
    ),
    { provide: MAT_RIPPLE_GLOBAL_OPTIONS, useValue: globalRippleConfig },
    provideAngularMaterialTheme(),
  ],
};
