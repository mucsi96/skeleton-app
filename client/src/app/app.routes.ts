import { Routes, CanActivateFn } from '@angular/router';
import { inject } from '@angular/core';
import { AuthService } from './auth.service';

const authGuard: CanActivateFn = () => inject(AuthService).isAuthenticated();

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () =>
      import('./home/home.component').then((m) => m.HomeComponent),
    canActivate: [authGuard],
    title: '',
  },
];
