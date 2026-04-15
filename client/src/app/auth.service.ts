import { Signal } from '@angular/core';

export abstract class AuthService {
  abstract readonly isAuthenticated: Signal<boolean>;
  abstract login(): Promise<void>;
  abstract getToken(): string;
}
