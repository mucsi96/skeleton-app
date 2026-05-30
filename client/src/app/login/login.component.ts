import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { AuthService } from '../auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    FormsModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
  ],
  templateUrl: './login.component.html',
  styleUrl: './login.component.css',
})
export class LoginComponent {
  private readonly authService = inject(AuthService);

  readonly email = signal('');
  readonly submitting = signal(false);
  readonly linkSent = signal(false);

  async sendLink(): Promise<void> {
    const email = this.email().trim();
    if (!email || this.submitting()) {
      return;
    }

    this.submitting.set(true);
    try {
      await this.authService.requestLink(email);
      this.linkSent.set(true);
    } finally {
      this.submitting.set(false);
    }
  }
}
