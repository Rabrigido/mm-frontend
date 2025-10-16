import {
  Component,
  Input,
  OnInit,
  computed,
  inject,
  signal,
  effect,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MetricsService } from '../../services/metrics.service';
import { FunctionsBarChartComponent } from './bar-chart/functions-bar-chart.component';

type AstLike = {
  type?: string;
  async?: boolean;
  generator?: boolean;
  id?: { name?: string };
  params?: any[];
  // otros campos del AST pueden venir, pero no los necesitamos aquí
};

type FileSummary = {
  path: string;
  total: number;
  async: number;
  arrow: number;
  decl: number;
  expr: number;
  maxParams: number;
  avgParams: number;
};

type MetricResponse = {
  name: string;
  description: string;
  result: Record<string, Record<string, AstLike>>;
  status: boolean;
};

@Component({
  selector: 'app-functions-per-file',
  standalone: true,
  imports: [CommonModule,
    FunctionsBarChartComponent
  ],
  templateUrl: './functions-per-file.component.html',
  styleUrls: ['./functions-per-file.component.css'],
})
export class FunctionsPerFileComponent implements OnInit {
  private svc = inject(MetricsService);

  @Input({ required: true }) repoId!: string;

  // estado
  loading = signal(false);
  error = signal<string | undefined>(undefined);

  // datos crudos de la métrica
  rawResult = signal<Record<string, Record<string, AstLike>>>({});

  // tabla
  search = signal('');
  sortBy = signal<keyof FileSummary>('total');
  sortDir = signal<'asc' | 'desc'>('desc');
  page = signal(1);
  pageSize = signal(10);
  selectedPath = signal<string | null>(null);

  // filas derivadas para la tabla
  rows = computed<FileSummary[]>(() => {
    const result = this.rawResult();
    const rows: FileSummary[] = [];

    for (const filePath of Object.keys(result)) {
      const funcs = result[filePath] ?? {};
      const names = Object.keys(funcs);

      let asyncCount = 0;
      let arrowCount = 0;
      let declCount = 0;
      let exprCount = 0;
      let paramsCounts: number[] = [];

      for (const fname of names) {
        const node = funcs[fname] ?? {};
        const t = (node.type ?? '').toLowerCase();

        // clasificación
        if (node.async) asyncCount++;
        if (t.includes('arrow')) arrowCount++;
        else if (t.includes('declaration')) declCount++;
        else if (t.includes('expression')) exprCount++;

        const pLen = Array.isArray(node.params) ? node.params.length : 0;
        paramsCounts.push(pLen);
      }

      const total = names.length;
      const maxParams = paramsCounts.length ? Math.max(...paramsCounts) : 0;
      const avgParams =
        paramsCounts.length
          ? Number(
              (paramsCounts.reduce((a, b) => a + b, 0) / paramsCounts.length).toFixed(2)
            )
          : 0;

      rows.push({
        path: filePath,
        total,
        async: asyncCount,
        arrow: arrowCount,
        decl: declCount,
        expr: exprCount,
        maxParams,
        avgParams,
      });
    }

    return rows;
  });

  // filtrado por búsqueda (en path)
  filtered = computed<FileSummary[]>(() => {
    const q = this.search().trim().toLowerCase();
    if (!q) return this.rows();
    return this.rows().filter((r) => r.path.toLowerCase().includes(q));
  });

  // ordenamiento
  sorted = computed<FileSummary[]>(() => {
    const by = this.sortBy();
    const dir = this.sortDir();
    const arr = [...this.filtered()];
    arr.sort((a, b) => {
      const av = a[by];
      const bv = b[by];
      if (typeof av === 'number' && typeof bv === 'number') {
        return dir === 'asc' ? av - bv : bv - av;
      }
      const as = String(av);
      const bs = String(bv);
      return dir === 'asc' ? as.localeCompare(bs) : bs.localeCompare(as);
    });
    return arr;
  });

  // paginación
  paged = computed<FileSummary[]>(() => {
    const p = this.page();
    const ps = this.pageSize();
    const start = (p - 1) * ps;
    return this.sorted().slice(start, start + ps);
  });

  // detalle del archivo seleccionado
  selectedFileFunctions = computed(() => {
    const path = this.selectedPath();
    if (!path) return [];
    const fileMap = this.rawResult()[path] ?? {};
    // transformar a lista con metadatos
    return Object.entries(fileMap).map(([name, node]) => {
      const type = (node?.type ?? '').toString();
      const isAsync = !!node?.async;
      const paramsCount = Array.isArray(node?.params) ? node!.params!.length : 0;
      return { name, type, async: isAsync, params: paramsCount, node };
    });
  });

  ngOnInit(): void {
    this.load();
    // si cambian los datos o el filtro de búsqueda, resetea a página 1
    effect(() => {
      void this.filtered();
      this.page.set(1);
    });
  }

  private load() {
    this.loading.set(true);
    this.error.set(undefined);

    this.svc
      .getMetric(this.repoId, 'functions-per-file')
      .subscribe({
        next: (res: MetricResponse) => {
          const ok = res?.status !== false && !!res?.result;
          if (!ok) {
            this.error.set('La métrica no devolvió datos válidos.');
            this.rawResult.set({});
          } else {
            this.rawResult.set(res.result || {});
          }
          this.loading.set(false);
        },
        error: (err) => {
          this.error.set(
            err?.error?.error || 'Error al cargar la métrica functions-per-file.'
          );
          this.rawResult.set({});
          this.loading.set(false);
        },
      });
  }

  onSort(col: keyof FileSummary) {
    if (this.sortBy() === col) {
      this.sortDir.set(this.sortDir() === 'asc' ? 'desc' : 'asc');
    } else {
      this.sortBy.set(col);
      this.sortDir.set('desc');
    }
  }

  goPage(delta: number) {
    const total = this.sorted().length;
    const ps = this.pageSize();
    const maxPage = Math.max(1, Math.ceil(total / ps));
    const next = Math.min(maxPage, Math.max(1, this.page() + delta));
    this.page.set(next);
  }

  selectRow(path: string) {
    this.selectedPath.set(path === this.selectedPath() ? null : path);
  }

  trackRow = (_: number, r: FileSummary) => r.path;
  trackFn = (_: number, f: any) => f.name;


}
