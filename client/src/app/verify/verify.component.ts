import { Component, inject, OnInit, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { BarLoaderComponent } from '@mucsi96/angular-material-theme';
import { AuthService } from '../auth.service';

@Component({
  selector: 'app-verify',
  standalone: true,
  imports: [BarLoaderComponent, MatButtonModule, RouterLink],
  templateUrl: './verify.component.html',
  styleUrl: './verify.component.css',
})
export class VerifyComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly failed = signal(false);

  async ngOnInit(): Promise<void> {
    const token = this.route.snapshot.queryParamMap.get('token');

    if (!token) {
      this.failed.set(true);
      return;
    }

    try {
      await this.authService.verify(token);
      await this.router.navigate(['/']);
    } catch {
      this.failed.set(true);
    }
  }
}
