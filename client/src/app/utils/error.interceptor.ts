import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { catchError, throwError } from 'rxjs';
import { AuthRenewService } from '../auth-renew.service';

export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const snackBar = inject(MatSnackBar);
  const authRenew = inject(AuthRenewService);
  return next(req).pipe(
    catchError((error) => {
      if (error instanceof HttpErrorResponse && error.status === 401) {
        authRenew.forceReauthorize();
        return throwError(() => error);
      }

      snackBar.open('An error occurred. ' + error.message, 'Close', {
        duration: 3000,
        verticalPosition: 'top',
        panelClass: ['error'],
      });

      return throwError(() => error);
    })
  );
};
