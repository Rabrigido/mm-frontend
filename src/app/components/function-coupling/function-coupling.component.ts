import {
  Component,
  Input,
  OnInit,
  inject,
  signal,
  computed,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MetricsService } from '../../services/metrics.service';

import { FunctionCouplingGraphComponent } from './graph/function-coupling-graph.component';
import { FunctionCouplingD3Component } from './radial-coupling/radial-coupling.component';
import { FunctionCouplingBarChartComponent } from './bar-chart/function-coupling-bar-chart.component';

type RawFC = {
  [filePath: string]: {
    [funcName: string]: {
      type: string;
      ['fan-in']?: Record<string, number>;
      ['fan-out']?: Record<string, number>;
    };
  };
};

type FCRow = {
  id: string;            // file::func
  func: string;
  file: string;
  dir: string;           // carpeta base
  fanIn: number;
  fanOut: number;
  coupling: number;      // fanIn + fanOut
  instability: number;   // I = fanOut / (fanIn + fanOut) (0..1) (0 si coupling=0)
};

type TabState<T> = { loading: boolean; error?: string; data?: T };

@Component({
  selector: 'function-coupling',
  standalone: true,
  imports: [CommonModule, FormsModule,
    FunctionCouplingD3Component, FunctionCouplingGraphComponent, FunctionCouplingBarChartComponent
  ],
  templateUrl: './function-coupling.component.html',
})
export class FunctionCouplingComponent implements OnInit {
  private http = inject(MetricsService);

  data : RawFC = {};

  @Input({ required: true }) repoId!: string;

  // ------ hijo (grafo) recibe el result crudo ------
  metricFunctionCoupling = signal<RawFC>({});

  // ---------------- state ----------------
  state = signal<TabState<FCRow[]>>({ loading: false });

  // filtros / ui
  search = signal<string>('');
  selectedDir = signal<string>('(todas)');
  topN = signal<number>(15);

  // sort
  sortBy = signal<keyof FCRow>('coupling');
  sortDir = signal<'asc' | 'desc'>('desc');

  // ---------------- derived ----------------
  rows = computed(() => this.state().data ?? []);
  dirs = computed(() => {
    const set = new Set<string>();
    for (const r of this.rows()) set.add(r.dir || '(root)');
    return ['(todas)', ...Array.from(set).sort()];
  });

  totalCoupling = computed(() =>
    this.rows().reduce((acc, r) => acc + r.coupling, 0)
  );

  filteredSorted = computed(() => {
    const q = this.search().trim().toLowerCase();
    const dir = this.selectedDir();
    const rows = this.rows().filter((r) => {
      const passDir = dir === '(todas)' ? true : (r.dir || '(root)') === dir;
      const passQ =
        !q ||
        r.func.toLowerCase().includes(q) ||
        r.file.toLowerCase().includes(q);
      return passDir && passQ;
    });

    const by = this.sortBy();
    const dirMul = this.sortDir() === 'asc' ? 1 : -1;

    rows.sort((a, b) => {
      const av = a[by];
      const bv = b[by];
      if (typeof av === 'number' && typeof bv === 'number') {
        return (av - bv) * dirMul;
      }
      return String(av).localeCompare(String(bv)) * dirMul;
    });

    const n = this.topN();
    return n > 0 ? rows.slice(0, n) : rows;
  });

  // ---------------- lifecycle ----------------
  ngOnInit(): void {
    this.load();
  }

  // ---------------- actions ----------------
  async load() {
    try {
      this.state.set({ loading: true });
      this.http.getMetric(this.repoId, 'function-coupling').subscribe({
        next: (resp) => {
          const raw: RawFC = resp?.result ?? {};
          this.data = raw;
          // -> hijo
          this.metricFunctionCoupling.set(raw);
          // -> ranking/tabla padre
          const rows = this.flatten(raw);
          this.state.set({ loading: false, data: rows });
        },
        error: (err) => {
          this.state.set({ loading: false, error: err?.message ?? 'Error' });
        },
      });
    } catch {
      this.state.set({ loading: false, error: 'Error cargando datos' });
    }
  }

  toggleSort(by: keyof FCRow) {
    if (this.sortBy() === by) {
      this.sortDir.set(this.sortDir() === 'asc' ? 'desc' : 'asc');
    } else {
      this.sortBy.set(by);
      this.sortDir.set(by === 'func' || by === 'file' || by === 'dir' ? 'asc' : 'desc');
    }
  }

  exportCSV() {
    const rows = this.filteredSorted();
    const header = ['función','archivo','carpeta','fan_in','fan_out','coupling','I','pct_total'];
    const total = this.totalCoupling() || 1;
    const lines = rows.map((r) => {
      const pct = (r.coupling / total) * 100;
      return [
        this.csvSafe(r.func),
        this.csvSafe(r.file),
        this.csvSafe(r.dir || '(root)'),
        r.fanIn,
        r.fanOut,
        r.coupling,
        r.instability.toFixed(3),
        pct.toFixed(2),
      ].join(',');
    });
    const blob = new Blob([header.join(',') + '\n' + lines.join('\n')], {
      type: 'text/csv;charset=utf-8',
    });
    this.downloadBlob(blob, 'function-coupling-ranking.csv');
  }

  exportJSON() {
    const total = this.totalCoupling() || 1;
    const payload = this.filteredSorted().map((r) => ({
      function: r.func,
      file: r.file,
      dir: r.dir || '(root)',
      fan_in: r.fanIn,
      fan_out: r.fanOut,
      coupling: r.coupling,
      instability: r.instability,
      pct_total: r.coupling / total,
    }));
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json;charset=utf-8',
    });
    this.downloadBlob(blob, 'function-coupling-ranking.json');
  }

  // ---------------- helpers ----------------
  private flatten(raw: RawFC): FCRow[] {
    const rows: FCRow[] = [];
    for (const file of Object.keys(raw || {})) {
      const entry = raw[file] || {};
      for (const func of Object.keys(entry)) {
        const rec = entry[func] as any;
        const fanIn = this.sumValues(rec?.['fan-in']);
        const fanOut = this.sumValues(rec?.['fan-out']);
        const coupling = fanIn + fanOut;
        const instability = coupling > 0 ? fanOut / coupling : 0;
        const dir = this.dirOf(file);
        rows.push({
          id: `${file}::${func}`,
          func,
          file,
          dir,
          fanIn,
          fanOut,
          coupling,
          instability,
        });
      }
    }
    return rows;
  }

  private sumValues(obj?: Record<string, number>): number {
    if (!obj) return 0;
    let s = 0;
    for (const k of Object.keys(obj)) s += Number(obj[k] ?? 0);
    return s;
  }

  private dirOf(file: string): string {
    if (!file) return '(root)';
    const norm = file.replace(/\\/g, '/');
    const idx = norm.lastIndexOf('/');
    return idx >= 0 ? norm.slice(0, idx) : '(root)';
  }

  private csvSafe(v: string): string {
    if (v == null) return '';
    const needs = /[",\n]/.test(v);
    return needs ? `"${v.replace(/"/g, '""')}"` : v;
  }

  private downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  trackRow = (_: number, r: FCRow) => r.id;
}
