import { Routes } from '@angular/router';
import { authGuard } from './auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () =>
      import('./login/login.component').then((m) => m.LoginComponent),
    title: 'Sign in',
  },
  {
    path: 'auth/verify',
    loadComponent: () =>
      import('./verify/verify.component').then((m) => m.VerifyComponent),
    title: 'Signing in',
  },
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () =>
      import('./home/home.component').then((m) => m.HomeComponent),
    canActivate: [authGuard],
    title: '',
  },
];
