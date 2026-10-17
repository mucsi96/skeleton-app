import { Component, inject } from '@angular/core';
import { UserProfileService } from '../user-profile.service';
import { MatMenuModule } from '@angular/material/menu';

@Component({
  selector: 'app-header',
  imports: [
    MatMenuModule,
  ],
  templateUrl: './header.component.html',
  styleUrl: './header.component.css',
})
export class HeaderComponent {
  profile = inject(UserProfileService).profile;
}
