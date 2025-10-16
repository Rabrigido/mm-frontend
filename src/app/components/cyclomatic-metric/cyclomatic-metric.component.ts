import { Component, Input, OnInit, signal, inject, ViewChild, ElementRef, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MetricsService } from '../../services/metrics.service';
import { Chart, registerables } from 'chart.js';

Chart.register(...registerables);

interface CyclomaticData {
  byFile: Record<string, { complexity: number }>;
  total: number;
  fileCount: number;
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
        <div class="bg-gradient-to-r from-blue-50 to-indigo-50 p-4 rounded-lg">
          <p class="text-sm text-gray-600">Complejidad Total</p>
          <p class="text-3xl font-bold text-indigo-600">{{ total() }}</p>
          <p class="text-xs text-gray-500 mt-1">en {{ fileCount() }} archivos</p>
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
  fileCount = signal(0);

  private chart: Chart | null = null;
  private chartData: { labels: string[]; data: number[] } = { labels: [], data: [] };
  private dataLoaded = false;

  ngOnInit() {
    this.loading.set(true);
    this.error.set(null);

    this.metricsService.getCyclomatic(this.repoId).subscribe({
      next: (data: CyclomaticData) => {
        this.total.set(data.total);
        this.fileCount.set(data.fileCount);

        // Get top 15 files by complexity
        const sorted = Object.entries(data.byFile)
          .sort(([, a], [, b]) => b.complexity - a.complexity)
          .slice(0, 15);

        this.chartData.labels = sorted.map(([file]) => {
          // Clean up the file path to show only the filename
          return file.split('\\').pop()?.split('/').pop() || file;
        });
        this.chartData.data = sorted.map(([, v]) => v.complexity);
        
        this.dataLoaded = true;
        this.loading.set(false);

        // Initialize chart after data is loaded
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

  ngAfterViewInit() {
    // Chart will be initialized in ngOnInit after data loads
  }

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
        indexAxis: 'y', // Horizontal bar chart for better readability
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
