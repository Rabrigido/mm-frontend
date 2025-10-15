import { Component, inject, signal, OnDestroy } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { ReposService } from '../../services/repos.service';
import { Repo } from '../../models/repo';
import { ScanResult } from '../../models/scan-result';
import { LocSlocComponent } from '../../components/loc-sloc/loc-sloc.component';
import * as echarts from 'echarts';
import { ReportsNavbarComponent, ReportKey  } from '../../shared/components/reports-navbar/reports-navbar.component';
import { Input } from '@angular/core';
import { NgIf, NgSwitch, NgSwitchCase } from '@angular/common';
import { Observable } from 'rxjs';



type FilesMode = 'byExtension' | 'byFolder' | 'treemap' | 'depth';



@Component({
  selector: 'app-repo-detail-page',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,

    LocSlocComponent,
    ReportsNavbarComponent,

  ],
  templateUrl: './repo-detail-page.component.html',
})
export class RepoDetailPageComponent implements OnDestroy {
  private route = inject(ActivatedRoute);
  private reposService = inject(ReposService);


  builtInMetrics = [
    'class-coupling',
    'classes-per-file',
    'errors',
    'file-coupling',
    'files',
    'function-coupling',
    'functions-per-file',
  ];

  // acá tienes tu signal de selección
  selectedReport = signal<ReportKey | null>(null);

  // Estado general
  repo = signal<Repo | null>(null);
  scan = signal<ScanResult | null>(null);
  loading = signal(false);
  error = signal<string | null>(null);
  id = this.route.snapshot.paramMap.get('id')!;
@Input() loader?: () => Observable<string[]>;
  // Tabs de métricas (arriba)
  activeMetric = signal<string>('');
  activeSubtab = signal<'json' | 'charts'>('json');

  // Estado de gráficos
  chartStatus = signal<Record<string, 'idle' | 'empty' | 'ok' | 'error'>>({});
  private charts = new Map<string, echarts.ECharts>();
  private resizeBound = false;
  private resizeHandler = () => { for (const ch of this.charts.values()) ch.resize(); };

  // File coupling (panel especial)
  fileCouplingMetric: {
    name: string;
    description: string;
    result: any;
    status: boolean;
  } | null = null;

  ngOnInit() {
    this.load();
  }

  ngOnDestroy() {
    for (const ch of this.charts.values()) ch.dispose();
    this.charts.clear();
    if (this.resizeBound) {
      window.removeEventListener('resize', this.resizeHandler as any);
      this.resizeBound = false;
    }
  }



  hasFilesMetric(): boolean {
    const s = this.scan();
    const mm: any = s?.modularityMetrics ?? {};
    const files = mm?.['../../../../files'];
    if (!files) return false;
    // puede venir como array o como objeto con .result
    return (Array.isArray(files) && files.length > 0) ||
           (files && Array.isArray(files.result) && files.result.length > 0);
  }


  objectKeys = (o: Record<string, unknown>) => Object.keys(o ?? {});

  /** Lista de métricas (todas las claves del objeto modularityMetrics) */
  metricKeys(): string[] {
    const s = this.scan();
    const mm: any = s?.modularityMetrics ?? {};
    if (!mm || typeof mm !== 'object') return [];
    return Object.keys(mm);
  }

  /** Selección de métrica (tab superior) */
  selectMetric(key: string) {
    if (this.activeMetric() === key) return;
    this.activeMetric.set(key);
    this.activeSubtab.set('json'); // al cambiar de métrica, volvemos a JSON
  }

  /** Selección de subtab (json/charts) */
  selectInnerTab(tab: 'json' | 'charts') {
    this.activeSubtab.set(tab);
    if (tab === 'charts') {
      if (this.activeMetric() === 'file-coupling') {
        // componentes especiales — sin ECharts general
        return;
      }
      queueMicrotask(() => this.buildChartForMetric(this.activeMetric()));
    }
  }

  private ensureResizeListener() {
    if (!this.resizeBound) {
      window.addEventListener('resize', this.resizeHandler as any, { passive: true });
      this.resizeBound = true;
    }
  }

  /** Construye / actualiza gráfico para la métrica activa (genérico) */
  private buildChartForMetric(key: string) {
    if (!key) return;
    try {
      const s = this.scan();
      const mm: any = s?.modularityMetrics ?? {};
      const data = mm?.[key];

      const el = document.getElementById('chart-' + key);
      if (!el) return;

      // Extraer pares numéricos de primer nivel
      const pairs: Array<{ name: string; value: number }> = [];
      if (data && typeof data === 'object' && !Array.isArray(data)) {
        for (const k of Object.keys(data)) {
          const v = (data as any)[k];
          if (typeof v === 'number' && Number.isFinite(v)) {
            pairs.push({ name: k, value: v });
          }
        }
      }

      // Heurística secundaria: campos comunes dentro de objetos
      if (pairs.length === 0 && data && typeof data === 'object') {
        const candFields = ['count', 'fanIn', 'fanOut', 'size', 'lines', 'total', 'degree'];
        const inferred: Array<{ name: string; value: number }> = [];
        for (const k of Object.keys(data)) {
          const v = (data as any)[k];
          if (v && typeof v === 'object') {
            const f = candFields.find((fk) => typeof v[fk] === 'number' && Number.isFinite(v[fk]));
            if (f) inferred.push({ name: k, value: v[f] });
          }
        }
        if (inferred.length === 0) {
          const st = this.chartStatus();
          this.chartStatus.set({ ...st, [key]: 'empty' });
          return;
        }
        pairs.push(...inferred);
      }

      // Top 20
      pairs.sort((a, b) => b.value - a.value);
      const top = pairs.slice(0, 20);
      const names = top.map((d) => d.name);
      const values = top.map((d) => d.value);

      // Reutiliza chart si existe
      let chart = this.charts.get(key);
      if (!chart) {
        chart = echarts.init(el);
        this.charts.set(key, chart);
      }

      chart.setOption({
        tooltip: { trigger: 'axis' },
        grid: { left: 12, right: 12, top: 24, bottom: 48, containLabel: true },
        xAxis: { type: 'category', data: names, axisLabel: { rotate: 45, fontSize: 10 } },
        yAxis: { type: 'value' },
        series: [{ type: 'bar', data: values }],
      });

      const st = this.chartStatus();
      this.chartStatus.set({ ...st, [key]: 'ok' });
      this.ensureResizeListener();
    } catch {
      const st = this.chartStatus();
      this.chartStatus.set({ ...st, [key]: 'error' });
    }
  }

  // ====== Carga de datos y acciones ======
  load() {
    this.loading.set(true);
    this.error.set(null);
    this.reposService.getRepo(this.id).subscribe({
      next: (r) => {
        this.repo.set(r);
        this.loading.set(false);
      },
      error: (e) => {
        this.error.set(e?.message ?? 'Error');
        this.loading.set(false);
      },
    });
  }

  runScan() {
    this.loading.set(true);
    this.error.set(null);
    this.reposService.scanRepo(this.id).subscribe({
      next: (res) => {
        // Reset gráficos previos
        for (const ch of this.charts.values()) ch.dispose();
        this.charts.clear();
        this.chartStatus.set({});

        this.scan.set(res);

        // Configura file-coupling si viene
        const mm: any = (res as any)?.modularityMetrics ?? {};
        this.fileCouplingMetric = mm?.['file-coupling'] ?? null;

        // Inicializa tabs: métrica activa = primera clave disponible
        const keys = this.metricKeys();
        this.activeMetric.set(keys[0] ?? '');
        this.activeSubtab.set('json');

        this.loading.set(false);
      },
      error: (e) => {
        this.error.set(e?.error?.message ?? 'No se pudo ejecutar el scanner');
        this.loading.set(false);
      },
    });
  }

  downloadScanJson() {
    const s = this.scan();
    if (!s) return;

    const pretty = JSON.stringify(s, null, 2);
    const blob = new Blob([pretty], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const safeDate = (s.scannedAt ? new Date(s.scannedAt) : new Date())
      .toISOString()
      .replace(/[:.]/g, '-');
    const filename = `scan-${s.repoId}-${safeDate}.json`;

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  getMetricValueByKey(mm: any, key: string): any {
    if (!mm || typeof mm !== 'object' || !key) return null;
    return mm[key];
  }
}
