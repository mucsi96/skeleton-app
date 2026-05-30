import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { NotificationsService } from '@mucsi96/angular-material-theme';
import { catchError } from 'rxjs';

export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const notifications = inject(NotificationsService);
  return next(req).pipe(
    catchError((error) => {
      // Auth endpoints surface their own messaging (login form, verify page,
      // unauthenticated session checks), so skip the global notification here.
      if (!req.url.startsWith('/api/auth/')) {
        notifications.error('An error occurred. ' + error.message);
      }
      return Promise.reject(error);
    })
  );
};
