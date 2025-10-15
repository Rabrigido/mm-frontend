import { Component, Input, OnInit, computed, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MetricsService } from '../../services/metrics.service';
import { FilesTreeComponent } from './files-tree/files-tree.component';

type FilesMetricResponse = {
  name: string;
  description: string;
  result: string[];     // lista de paths absolutos
  status: boolean;
};

@Component({
  selector: 'app-files-metric',
  standalone: true,
  imports: [CommonModule, FilesTreeComponent],
  templateUrl: './files-metric.component.html',
})
export class FilesMetricComponent implements OnInit {
  private svc = inject(MetricsService);

  @Input({ required: true }) repoId!: string;

  // state
  loading = signal(false);
  error = signal<string | null>(null);
  name = signal('Files on Repository');
  description = signal('Collects and records all source files in the repository by their path.');
  files = signal<string[]>([]);

  // ui state
  search = signal('');
  extFilter = signal<string>('all');
  page = signal(1);
  pageSize = signal(20);

  // derived
  extensions = computed(() => {
    const set = new Set<string>();
    for (const p of this.files()) set.add(this.getExt(p));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  });

  filtered = computed(() => {
    const q = this.search().toLowerCase().trim();
    const ext = this.extFilter();
    let list = this.files();

    if (ext !== 'all') list = list.filter(p => this.getExt(p) === ext);
    if (q) list = list.filter(p => p.toLowerCase().includes(q));

    return list;
  });

  totalPages = computed(() => Math.max(1, Math.ceil(this.filtered().length / this.pageSize())));
  pageSlice = computed(() => {
    const ps = this.pageSize();
    const start = (this.page() - 1) * ps;
    return this.filtered().slice(start, start + ps);
  });

  constructor() {
    // si cambian los filtros, vuelve a la página 1
    effect(() => {
      this.search();
      this.extFilter();
      this.page.set(1);
    });
  }

  ngOnInit(): void {
    this.fetch();
  }

  fetch() {
    this.loading.set(true);
    this.error.set(null);
    this.svc.getMetric(this.repoId, 'files').subscribe({
      next: (res: FilesMetricResponse) => {
        this.name.set(res?.name ?? this.name());
        this.description.set(res?.description ?? this.description());
        this.files.set(Array.isArray(res?.result) ? res.result : []);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(err?.error?.error || 'Error al cargar la métrica "files".');
        this.loading.set(false);
      },
    });
  }

  resetFilters() {
    this.search.set('');
    this.extFilter.set('all');
  }

  copyPath(path: string) {
    navigator.clipboard?.writeText(path).catch(() => {});
  }

  downloadJSON() {
    const blob = new Blob([JSON.stringify(this.files(), null, 2)], { type: 'application/json' });
    this.downloadBlob(blob, `files-${this.repoId}.json`);
  }

  downloadCSV() {
    const header = 'path\n';
    const body = this.files().map(p => `"${p.replace(/"/g, '""')}"`).join('\n');
    const blob = new Blob([header + body], { type: 'text/csv;charset=utf-8;' });
    this.downloadBlob(blob, `files-${this.repoId}.csv`);
  }

  // helpers
  private getExt(p: string): string {
    const idx = p.lastIndexOf('.');
    if (idx === -1) return '(no ext)';
    const ext = p.slice(idx);
    // normaliza algo como ".d.ts" conservando multi-extensiones
    if (ext === '.ts' && p.endsWith('.d.ts')) return '.d.ts';
    return ext;
  }

  private downloadBlob(blob: Blob, filename: string) {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
      URL.revokeObjectURL(link.href);
      document.body.removeChild(link);
    }, 0);
  }
}
