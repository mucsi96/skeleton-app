import { Routes, CanActivateFn } from '@angular/router';
import { inject } from '@angular/core';
import { MsalGuard } from '@azure/msal-angular';
import { ENVIRONMENT_CONFIG } from './environment/environment.config';

// Guard factory that checks if auth is needed
const conditionalAuthGuard: CanActivateFn = (route, state) => {
  const { mockAuth } = inject(ENVIRONMENT_CONFIG);

  if (mockAuth) {
    return true;
  }

  const msalGuard = inject(MsalGuard);
  return msalGuard.canActivate(route, state);
};

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () =>
      import('./home/home.component').then((m) => m.HomeComponent),
    canActivate: [conditionalAuthGuard],
    title: '',
  },
];
