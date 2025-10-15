import { Component, Input, OnChanges, OnInit, SimpleChanges, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MetricsService } from '../../services/metrics.service';

type LocSlocResp = {
  total: { loc: number; sloc: number };
  byFile: Record<string, { loc: number; sloc: number }>;
  fileCount: number;
};

type Row = { file: string; loc: number; sloc: number; comments: number; slocRatio: number };

@Component({
  selector: 'app-loc-sloc',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './loc-sloc.component.html',
})
export class LocSlocComponent implements OnInit, OnChanges {
  private svc = inject(MetricsService);

  @Input({ required: true }) repoId!: string;

  loading = signal(false);
  error = signal<string | null>(null);
  data = signal<LocSlocResp | null>(null);

  // UI state
  q = signal(''); // filtro
  sortBy = signal<'sloc' | 'loc' | 'file'>('sloc');
  sortDir = signal<'desc' | 'asc'>('desc');

  rows = computed<Row[]>(() => {
    const resp = this.data();
    if (!resp) return [];
    const entries = Object.entries(resp.byFile).map(([file, v]) => {
      const comments = v.loc - v.sloc;
      return {
        file,
        loc: v.loc,
        sloc: v.sloc,
        comments,
        slocRatio: v.loc ? v.sloc / v.loc : 0,
      };
    });

    // filter
    const q = this.q().toLowerCase().trim();
    const filtered = q ? entries.filter(r => r.file.toLowerCase().includes(q)) : entries;

    // sort
    const key = this.sortBy();
    const dir = this.sortDir();
    filtered.sort((a, b) => {
      let cmp = 0;
      if (key === 'file') cmp = a.file.localeCompare(b.file);
      else cmp = (b as any)[key] - (a as any)[key]; // default desc for numbers
      return dir === 'desc' ? cmp : -cmp;
    });

    return filtered;
  });

  ngOnInit() {
    this.fetch();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['repoId'] && !changes['repoId'].firstChange) {
      this.fetch(true);
    }
  }

  fetch(force = false) {
    if (!this.repoId) return;
    this.loading.set(true);
    this.error.set(null);
    if (force) this.data.set(null);

    this.svc.getLocSloc(this.repoId).subscribe({
      next: (resp) => {
        this.data.set(resp);
        this.loading.set(false);
      },
      error: (err) => {
        const msg = err?.error?.error || err?.message || 'Error al obtener LOC/SLOC';
        this.error.set(msg);
        this.loading.set(false);
      },
    });
  }

  toggleSort(col: 'sloc' | 'loc' | 'file') {
    if (this.sortBy() === col) {
      this.sortDir.set(this.sortDir() === 'desc' ? 'asc' : 'desc');
    } else {
      this.sortBy.set(col);
      this.sortDir.set(col === 'file' ? 'asc' : 'desc');
    }
  }

  fmtPct(n: number) {
    return (n * 100).toFixed(1) + '%';
  }

  downloadJSON() {
    const payload = this.data();
    if (!payload) return;
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `loc-sloc-${this.repoId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
}
