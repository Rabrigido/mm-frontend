import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { CommonModule } from '@angular/common';
import { ReposService } from '../../services/repos.service';
import { Repo } from '../../models/repo';
import { ScanResult } from '../../models/scan-result';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-repo-detail-page',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './repo-detail-page.component.html'
})
export class RepoDetailPageComponent {
  private route = inject(ActivatedRoute);
  private reposService = inject(ReposService);

  repo = signal<Repo | null>(null);
  scan = signal<ScanResult | null>(null);
  loading = signal(false);
  error = signal<string | null>(null);
  id = this.route.snapshot.paramMap.get('id')!;

  ngOnInit() {
    this.load();
  }

  load() {
    this.loading.set(true);
    this.error.set(null);
    this.reposService.getRepo(this.id).subscribe({
      next: (r) => { this.repo.set(r); this.loading.set(false); },
      error: (e) => { this.error.set(e?.message ?? 'Error'); this.loading.set(false); }
    });
  }

  runScan() {
    this.loading.set(true);
    this.error.set(null);
    this.reposService.scanRepo(this.id).subscribe({
      next: (res) => { this.scan.set(res); this.loading.set(false); },
      error: (e) => { this.error.set(e?.error?.message ?? 'No se pudo ejecutar el scanner'); this.loading.set(false); }
    });
  }

    // ⬇️ NUEVO: Descargar el JSON del scan actual
  downloadScanJson() {
    const s = this.scan();
    if (!s) return;

    const pretty = JSON.stringify(s, null, 2);
    const blob = new Blob([pretty], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const safeDate = (s.scannedAt ? new Date(s.scannedAt) : new Date())
      .toISOString().replace(/[:.]/g, '-');
    const filename = `scan-${s.repoId}-${safeDate}.json`;

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

}
