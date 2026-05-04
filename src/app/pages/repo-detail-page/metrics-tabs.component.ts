import { Component, Input, Output, EventEmitter, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ChartRendererService } from '../../services/chart-renderer.service';

/**
 * Displays and manages metric selection tabs and chart rendering.
 * Handles metric tab switching, chart/json subtab selection, and chart rendering.
 */
@Component({
  selector: 'app-metrics-tabs',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="mt-6 bg-white rounded-2xl border p-4">
      <h2 class="text-xl font-semibold mb-4">Métricas</h2>

      <!-- Metric tabs -->
      <div class="flex gap-2 border-b mb-4 overflow-x-auto">
        <button
          *ngFor="let metricKey of metricKeys"
          (click)="selectMetric(metricKey)"
          [class.border-b-2]="activeMetric() === metricKey"
          [class.border-emerald-600]="activeMetric() === metricKey"
          [class.text-emerald-600]="activeMetric() === metricKey"
          class="px-3 py-2 text-sm whitespace-nowrap hover:text-emerald-600"
        >
          {{ metricKey }}
        </button>
      </div>

      <!-- Subtabs: JSON / Charts -->
      <div class="flex gap-4 mb-4">
        <button
          (click)="selectSubtab('json')"
          [class.text-emerald-600]="activeSubtab() === 'json'"
          [class.border-b-2]="activeSubtab() === 'json'"
          [class.border-emerald-600]="activeSubtab() === 'json'"
          class="px-3 py-2 text-sm hover:text-emerald-600"
        >
          JSON
        </button>
        <button
          (click)="selectSubtab('charts')"
          [class.text-emerald-600]="activeSubtab() === 'charts'"
          [class.border-b-2]="activeSubtab() === 'charts'"
          [class.border-emerald-600]="activeSubtab() === 'charts'"
          class="px-3 py-2 text-sm hover:text-emerald-600"
        >
          Charts
        </button>
      </div>

      <!-- Content: JSON view -->
      <div *ngIf="activeSubtab() === 'json'" class="bg-gray-50 rounded-lg p-4">
        <pre class="text-xs overflow-auto max-h-96">{{ getMetricData() | json }}</pre>
      </div>

      <!-- Content: Chart view -->
      <div *ngIf="activeSubtab() === 'charts'" class="bg-gray-50 rounded-lg p-4">
        <div
          [id]="'chart-' + activeMetric()"
          [style.height.px]="400"
          *ngIf="chartStatus()[activeMetric()] === 'ok'"
        ></div>
        <div *ngIf="chartStatus()[activeMetric()] === 'empty'" class="text-gray-500 text-center py-8">
          No numeric data available for chart
        </div>
        <div *ngIf="chartStatus()[activeMetric()] === 'error'" class="text-red-600 text-center py-8">
          Error rendering chart
        </div>
        <div *ngIf="!chartStatus()[activeMetric()]" class="text-gray-400 text-center py-8">
          Select a metric to view chart
        </div>
      </div>
    </div>
  `
})
export class MetricsTabsComponent {
  private chartRenderer = inject(ChartRendererService);

  @Input() metricKeys: string[] = [];
  @Input() metricsData: Record<string, any> = {};
  @Output() metricChanged = new EventEmitter<string>();
  @Output() subtabChanged = new EventEmitter<'json' | 'charts'>();

  activeMetric = signal<string>('');
  activeSubtab = signal<'json' | 'charts'>('json');
  chartStatus = signal<Record<string, 'idle' | 'empty' | 'ok' | 'error'>>({});

  selectMetric(key: string): void {
    if (this.activeMetric() === key) return;
    this.activeMetric.set(key);
    this.activeSubtab.set('json');
    this.metricChanged.emit(key);
  }

  selectSubtab(tab: 'json' | 'charts'): void {
    this.activeSubtab.set(tab);
    this.subtabChanged.emit(tab);

    if (tab === 'charts') {
      queueMicrotask(() => this.renderChart());
    }
  }

  getMetricData(): any {
    return this.metricsData[this.activeMetric()] ?? null;
  }

  private renderChart(): void {
    const data = this.getMetricData();
    if (!data) return;

    const status = this.chartRenderer.renderChart(
      this.activeMetric(),
      data,
      'chart-' + this.activeMetric()
    );

    const currentStatus = this.chartStatus();
    this.chartStatus.set({ ...currentStatus, [this.activeMetric()]: status });
  }

  ngOnDestroy(): void {
    this.chartRenderer.disposeAll();
  }
}
