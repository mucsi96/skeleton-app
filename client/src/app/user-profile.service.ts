import { computed, Injectable, inject } from '@angular/core';
import { AuthService } from './auth.service';

@Injectable({
  providedIn: 'root',
})
export class UserProfileService {
  private readonly authService = inject(AuthService);

  profile = computed(() => {
    const user = this.authService.user();

    if (!user) {
      return undefined;
    }

    return {
      name: user.email,
      initials: this.getInitials(user.email),
    };
  });

  private getInitials(email: string): string {
    const localPart = email.split('@')[0];
    return localPart
      .split(/[.\-_+]/)
      .filter((part) => part.length > 0)
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toUpperCase();
  }
}
