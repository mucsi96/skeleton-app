import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { fetchJson } from './utils/fetchJson';

export interface User {
  email: string;
}

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly http = inject(HttpClient);

  private readonly currentUser = signal<User | undefined>(undefined);

  readonly user = this.currentUser.asReadonly();
  readonly isAuthenticated = computed(() => this.currentUser() !== undefined);

  async loadUser(): Promise<void> {
    try {
      const user = await fetchJson<User>(this.http, '/api/auth/me');
      this.currentUser.set(user);
    } catch {
      this.currentUser.set(undefined);
    }
  }

  async requestLink(email: string): Promise<void> {
    await fetchJson(this.http, '/api/auth/request-link', {
      method: 'post',
      body: { email },
    });
  }

  async verify(token: string): Promise<void> {
    const user = await fetchJson<User>(this.http, '/api/auth/verify', {
      method: 'post',
      body: { token },
    });
    this.currentUser.set(user);
  }

  async logout(): Promise<void> {
    await fetchJson(this.http, '/api/auth/logout', { method: 'post' });
    this.currentUser.set(undefined);
  }
}
