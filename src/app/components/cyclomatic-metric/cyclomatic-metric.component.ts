import { Component, Input, OnInit, signal, inject, ViewChild, ElementRef, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MetricsService } from '../../services/metrics.service';
import { Chart, registerables } from 'chart.js';

Chart.register(...registerables);

interface CyclomaticData {
  byFile: Record<string, { complexity: number }>;
  total: number;
  fileCount: number;
  average: number;  // Add this
}

@Component({
  selector: 'app-cyclomatic-metric',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="p-4 bg-white rounded-xl border">
      <h2 class="text-lg font-semibold mb-4">Complejidad Ciclomática</h2>

      <div *ngIf="loading()" class="text-gray-500">Cargando métricas...</div>
      <div *ngIf="error()" class="text-red-500">{{ error() }}</div>

      <div *ngIf="!loading() && !error()" class="space-y-4">
        <div class="grid grid-cols-2 gap-4">
          <div class="bg-gradient-to-r from-blue-50 to-indigo-50 p-4 rounded-lg">
            <p class="text-sm text-gray-600">Complejidad Total</p>
            <p class="text-3xl font-bold text-indigo-600">{{ total() }}</p>
            <p class="text-xs text-gray-500 mt-1">en {{ fileCount() }} archivos</p>
          </div>
          
          <div class="bg-gradient-to-r from-purple-50 to-pink-50 p-4 rounded-lg">
            <p class="text-sm text-gray-600">Promedio</p>
            <p class="text-3xl font-bold text-purple-600">{{ average() | number:'1.2-2' }}</p>
            <p class="text-xs text-gray-500 mt-1">por archivo</p>
          </div>
        </div>

        <div class="relative h-96">
          <canvas #chartCanvas></canvas>
        </div>
      </div>
    </div>
  `,
})
export class CyclomaticMetricComponent implements OnInit, AfterViewInit {
  private metricsService = inject(MetricsService);
  @ViewChild('chartCanvas') chartCanvas!: ElementRef<HTMLCanvasElement>;

  @Input({ required: true }) repoId!: string;

  loading = signal(true);
  error = signal<string | null>(null);
  total = signal(0);
  average = signal(0);  // Add this
  fileCount = signal(0);

  private chart: Chart | null = null;
  private chartData: { labels: string[]; data: number[] } = { labels: [], data: [] };

  ngOnInit() {
    this.loading.set(true);
    this.error.set(null);

    this.metricsService.getCyclomatic(this.repoId).subscribe({
      next: (data: CyclomaticData) => {
        this.total.set(data.total);
        this.average.set(data.average);  // Add this
        this.fileCount.set(data.fileCount);

        const sorted = Object.entries(data.byFile)
          .sort(([, a], [, b]) => b.complexity - a.complexity)
          .slice(0, 15);

        this.chartData.labels = sorted.map(([file]) => 
          file.split('\\').pop()?.split('/').pop() || file
        );
        this.chartData.data = sorted.map(([, v]) => v.complexity);

        this.loading.set(false);
        setTimeout(() => this.initChart(), 100);
      },
      error: (err: unknown) => {
        this.loading.set(false);
        const message = err instanceof Error ? err.message : 'Error al cargar la métrica';
        this.error.set(message);
        console.error(err);
      },
    });
  }

  ngAfterViewInit() {}

  private initChart() {
    if (!this.chartCanvas) return;

    if (this.chart) {
      this.chart.destroy();
    }

    const ctx = this.chartCanvas.nativeElement.getContext('2d');
    if (!ctx || this.chartData.labels.length === 0) return;

    this.chart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: this.chartData.labels,
        datasets: [{
          label: 'Complejidad Ciclomática',
          data: this.chartData.data,
          backgroundColor: 'rgba(54, 162, 235, 0.8)',
          borderColor: 'rgba(54, 162, 235, 1)',
          borderWidth: 2,
          borderRadius: 4,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: 'y',
        plugins: {
          legend: { display: true, position: 'top' },
          title: { display: false },
        },
        scales: {
          x: {
            beginAtZero: true,
            ticks: { stepSize: 1 },
          },
        },
      },
    });
  }
}
