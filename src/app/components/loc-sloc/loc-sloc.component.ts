import {
  Component,
  Input,
  OnChanges,
  OnInit,
  SimpleChanges,
  inject,
  signal,
  computed,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MetricsService } from '../../services/metrics.service';
import { LocSlocGraphsComponent } from './chart/loc-sloc-chart.component';

type LocSlocResp = {
  total: { loc: number; sloc: number };
  byFile: Record<string, { loc: number; sloc: number }>;
  fileCount: number;
};

type Row = { file: string; loc: number; sloc: number; comments: number; slocRatio: number };

// Tipos que consume el hijo:
type LocChartRow = { path: string; loc: number; sloc: number; ext?: string };
type LocPoint = { date: string; loc: number; sloc: number };

@Component({
  selector: 'app-loc-sloc',
  standalone: true,
  imports: [CommonModule, LocSlocGraphsComponent],
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

  // Paginación
  pageSize = signal<number>(25);
  pageIndex = signal<number>(0);

  // (Opcional) historia para el gráfico de tendencia
  locHistory = signal<LocPoint[]>([]);

  // Helpers
  private extFrom(path: string) {
    const i = path.lastIndexOf('.');
    return i >= 0 ? path.slice(i) : '(sin ext)';
  }

  // Filtradas + ordenadas (sin paginar)
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

    // al cambiar filtro/orden, volvemos a la primera página
    return filtered;
  });

  // Para el hijo (transforma rows -> {path,loc,sloc,ext})
  chartData = computed<LocChartRow[]>(() =>
    this.rows().map(r => ({
      path: r.file,
      loc: r.loc,
      sloc: r.sloc,
      ext: this.extFrom(r.file),
    }))
  );

  // Paginación derivada
  totalRows = computed(() => this.rows().length);
  pageCount = computed(() =>
    Math.max(1, Math.ceil(this.totalRows() / this.pageSize()))
  );
  pagedRows = computed<Row[]>(() => {
    const start = this.pageIndex() * this.pageSize();
    return this.rows().slice(start, start + this.pageSize());
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
        this.pageIndex.set(0); // reset paginación
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
  this.pageIndex.set(0); // ✅ mover aquí
}

onFilterInput(value: string) {
  this.q.set(value);
  this.pageIndex.set(0); // ✅ mover aquí
}

  fmtPct(n: number) {
    return (n * 100).toFixed(1) + '%';
  }

  // Paginación handlers
  setPageSize(ps: number) {
    this.pageSize.set(ps);
    this.pageIndex.set(0);
  }
  prevPage() {
    this.pageIndex.set(Math.max(0, this.pageIndex() - 1));
  }
  nextPage() {
    this.pageIndex.set(Math.min(this.pageCount() - 1, this.pageIndex() + 1));
  }
  goToPage(i: number) {
    const clamped = Math.min(Math.max(0, i), this.pageCount() - 1);
    this.pageIndex.set(clamped);
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

  trackByFile = (_: number, r: Row) => r.file;
}
