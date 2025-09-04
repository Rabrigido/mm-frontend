import { Component, inject, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ReposService } from '../../services/repos.service';
import { Repo } from '../../models/repo';

@Component({
  selector: 'app-repos-page',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './repos-page.component.html',
})
export class ReposPageComponent {
  private reposService = inject(ReposService);

  repos = signal<Repo[] | null>(null);
  loading = signal(false);
  error = signal<string | null>(null);
  gitUrl = signal('');

  ngOnInit() {
    this.load();
  }

  load() {
    this.loading.set(true);
    this.error.set(null);
    this.reposService.getRepos().subscribe({
      next: (data) => { this.repos.set(data); this.loading.set(false); },
      error: (e) => { this.error.set(e?.message ?? 'Error cargando repos'); this.loading.set(false); }
    });
  }

  addRepo() {
    const url = this.gitUrl().trim();
    if (!url) return;
    this.loading.set(true);
    this.reposService.addRepo(url).subscribe({
      next: () => { this.gitUrl.set(''); this.load(); },
      error: (e) => { this.error.set(e?.error?.message ?? 'No se pudo agregar'); this.loading.set(false); }
    });
  }

  deleteRepo(id: string) {
    if (!confirm('¿Eliminar este repo del servidor?')) return;
    this.loading.set(true);
    this.reposService.deleteRepo(id).subscribe({
      next: () => this.load(),
      error: (e) => { this.error.set(e?.error?.message ?? 'No se pudo eliminar'); this.loading.set(false); }
    });
  }
}
