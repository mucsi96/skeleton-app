import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink, RouterOutlet } from '@angular/router';
import { HeaderComponent } from './header/header.component';
import { AuthService } from './auth.service';
import { GreetingService } from './greeting.service';

@Component({
  selector: 'app-root',
  imports: [
    RouterOutlet,
    RouterLink,
    MatToolbarModule,
    MatButtonModule,
    MatTooltipModule,
    HeaderComponent,
  ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
})
export class AppComponent {
  private readonly greetingService = inject(GreetingService);
  isAuthenticated = inject(AuthService).isAuthenticated;

  reloadGreeting() {
    this.greetingService.greeting.reload();
  }
}
