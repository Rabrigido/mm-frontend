import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  template: `
  <div class="min-h-screen bg-gray-100">
    <nav class="bg-white border-b">
      <div class="max-w-5xl mx-auto p-4 flex items-center justify-between">
        <a routerLink="/repos" class="font-semibold">Modularity Metrics</a>
      </div>
    </nav>
    <router-outlet />
  </div>
  `
})
export class AppComponent {}
