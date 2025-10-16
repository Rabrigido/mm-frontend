import { Component, Input, OnInit, signal, inject, ViewChild, ElementRef, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MetricsService } from '../../services/metrics.service';
import { Chart, registerables } from 'chart.js';
import { Subject, takeUntil } from 'rxjs';

Chart.register(...registerables);

interface ClassMember {
  type: 'ClassMethod' | 'ClassProperty';
  key: { type: string; name: string };
  params?: any[];
  body?: any;
  value?: any;
}

interface ClassesPerFileResponse {
  name: string;
  description: string;
  result: Record<string, Record<string, ClassMember[]>>;
  status: boolean;
}

@Component({
  selector: 'app-classes-per-file',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="p-4 bg-white rounded-xl border">
      <h2 class="text-lg font-semibold mb-4">Clases por Archivo</h2>

      <div *ngIf="loading()" class="text-gray-500">Cargando métricas...</div>
      <div *ngIf="error()" class="text-red-500">{{ error() }}</div>

      <div *ngIf="!loading() && !error()" class="space-y-6">
        <!-- Summary Card -->
        <div class="bg-gradient-to-r from-purple-50 to-pink-50 p-4 rounded-lg">
          <p class="text-sm text-gray-600">Total de Clases</p>
          <p class="text-3xl font-bold text-purple-600">{{ totalClasses() }}</p>
          <p class="text-xs text-gray-500 mt-1">en {{ fileCount() }} archivos</p>
        </div>

        <!-- Chart 1: Classes per File -->
        <div class="space-y-2">
          <h3 class="font-semibold text-sm">Clases por Archivo</h3>
          <div class="relative h-96">
            <canvas #classesPerFileChart></canvas>
          </div>
        </div>

        <!-- Chart 2: Methods vs Properties per Class -->
        <div class="space-y-2">
          <h3 class="font-semibold text-sm">Métodos vs Propiedades</h3>
          <div class="relative h-96">
            <canvas #membersPerClassChart></canvas>
          </div>
        </div>

        <!-- Chart 3: Class Distribution by File (Pie) -->
        <div class="space-y-2">
          <h3 class="font-semibold text-sm">Distribución de Clases por Archivo</h3>
          <div class="relative h-96">
            <canvas #classDistributionChart></canvas>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class ClassesPerFileComponent implements OnInit, OnDestroy {
  private metricsService = inject(MetricsService);
  private destroy$ = new Subject<void>();

  @Input({ required: true }) repoId!: string;
  @ViewChild('classesPerFileChart') classesPerFileChart!: ElementRef<HTMLCanvasElement>;
  @ViewChild('membersPerClassChart') membersPerClassChart!: ElementRef<HTMLCanvasElement>;
  @ViewChild('classDistributionChart') classDistributionChart!: ElementRef<HTMLCanvasElement>;

  loading = signal(true);
  error = signal<string | null>(null);
  totalClasses = signal(0);
  fileCount = signal(0);

  private charts: Map<string, Chart<any, any, any>> = new Map();

  private dataLoaded = false;

  ngOnInit() {
    // Prevent multiple loads
    if (this.dataLoaded) {
      return;
    }

    this.loading.set(true);
    this.error.set(null);

    console.log('Loading classes-per-file for repoId:', this.repoId);

    this.metricsService
      .getMetric(this.repoId, 'classes-per-file')
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (data: ClassesPerFileResponse) => {
          console.log('Classes-per-file data received:', data);

          // Validate data structure
          if (!data.result || !data.status) {
            this.error.set('Datos inválidos: estructura no esperada');
            this.loading.set(false);
            return;
          }

          const files = Object.keys(data.result);
          this.fileCount.set(files.length);

          // Calculate total classes
          let totalClasses = 0;
          for (const file of files) {
            totalClasses += Object.keys(data.result[file]).length;
          }
          this.totalClasses.set(totalClasses);

          this.dataLoaded = true;
          this.loading.set(false);

          console.log('Total classes:', totalClasses, 'in', files.length, 'files');
          console.log('Charts rendering...');

          // Initialize charts after data loads
          setTimeout(() => this.renderCharts(data), 100);
        },
        error: (err: unknown) => {
          console.error('Error loading classes-per-file:', err);
          this.loading.set(false);
          const message = err instanceof Error ? err.message : 'Error al cargar la métrica';
          this.error.set(message);
        },
        complete: () => {
          console.log('Classes-per-file subscription completed');
        },
      });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();

    // Cleanup charts
    for (const chart of this.charts.values()) {
      if (chart) {
        chart.destroy();
      }
    }
    this.charts.clear();
  }

  private renderCharts(data: ClassesPerFileResponse) {
    try {
      this.renderClassesPerFileChart(data);
      this.renderMembersPerClassChart(data);
      this.renderClassDistributionChart(data);
      console.log('All charts rendered successfully');
    } catch (err) {
      console.error('Error rendering charts:', err);
      this.error.set('Error al renderizar los gráficos');
    }
  }

  private renderClassesPerFileChart(data: ClassesPerFileResponse) {
    if (!this.classesPerFileChart?.nativeElement) {
      console.warn('classesPerFileChart element not found');
      return;
    }

    const files = Object.keys(data.result);
    const classCounts = files.map(f => Object.keys(data.result[f]).length);

    const ctx = this.classesPerFileChart.nativeElement.getContext('2d');
    if (!ctx) {
      console.error('Could not get 2d context for classesPerFileChart');
      return;
    }

    const existing = this.charts.get('classesPerFile');
    if (existing) {
      existing.destroy();
    }

    const chart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: files.map(f => f.split('/').pop() || f),
        datasets: [{
          label: 'Clases por Archivo',
          data: classCounts,
          backgroundColor: 'rgba(168, 85, 247, 0.8)',
          borderColor: 'rgba(168, 85, 247, 1)',
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
        },
        scales: {
          x: {
            beginAtZero: true,
            ticks: { stepSize: 1 },
          },
        },
      },
    });

    this.charts.set('classesPerFile', chart);
  }

  private renderMembersPerClassChart(data: ClassesPerFileResponse) {
    if (!this.membersPerClassChart?.nativeElement) {
      console.warn('membersPerClassChart element not found');
      return;
    }

    const classLabels: string[] = [];
    const methodCounts: number[] = [];
    const propertyCounts: number[] = [];

    // Collect all classes and their members
    for (const file of Object.keys(data.result)) {
      for (const className of Object.keys(data.result[file])) {
        const members = data.result[file][className];

        const methods = members.filter(m => m.type === 'ClassMethod').length;
        const properties = members.filter(m => m.type === 'ClassProperty').length;

        classLabels.push(className);
        methodCounts.push(methods);
        propertyCounts.push(properties);
      }
    }

    const ctx = this.membersPerClassChart.nativeElement.getContext('2d');
    if (!ctx) {
      console.error('Could not get 2d context for membersPerClassChart');
      return;
    }

    const existing = this.charts.get('membersPerClass');
    if (existing) {
      existing.destroy();
    }

    const chart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: classLabels,
        datasets: [
          {
            label: 'Métodos',
            data: methodCounts,
            backgroundColor: 'rgba(76, 175, 80, 0.8)',
            borderColor: 'rgba(76, 175, 80, 1)',
            borderWidth: 1,
            borderRadius: 4,
          },
          {
            label: 'Propiedades',
            data: propertyCounts,
            backgroundColor: 'rgba(33, 150, 243, 0.8)',
            borderColor: 'rgba(33, 150, 243, 1)',
            borderWidth: 1,
            borderRadius: 4,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: 'y',
        plugins: {
          legend: { display: true, position: 'top' },
        },
        scales: {
          x: {
            stacked: true,
            beginAtZero: true,
            ticks: { stepSize: 1 },
          },
        },
      },
    });

    this.charts.set('membersPerClass', chart);
  }

  private renderClassDistributionChart(data: ClassesPerFileResponse) {
    if (!this.classDistributionChart?.nativeElement) {
      console.warn('classDistributionChart element not found');
      return;
    }

    const files = Object.keys(data.result);
    const classCounts = files.map(f => Object.keys(data.result[f]).length);

    const ctx = this.classDistributionChart.nativeElement.getContext('2d');
    if (!ctx) {
      console.error('Could not get 2d context for classDistributionChart');
      return;
    }

    const existing = this.charts.get('classDistribution');
    if (existing) {
      existing.destroy();
    }

    const colors = [
      'rgba(244, 67, 54, 0.8)',
      'rgba(255, 152, 0, 0.8)',
      'rgba(33, 150, 243, 0.8)',
      'rgba(76, 175, 80, 0.8)',
      'rgba(156, 39, 176, 0.8)',
      'rgba(233, 30, 99, 0.8)',
      'rgba(0, 188, 212, 0.8)',
      'rgba(255, 193, 7, 0.8)',
    ];

    const chart = new Chart(ctx, {
      type: 'pie',
      data: {
        labels: files.map(f => f.split('/').pop() || f),
        datasets: [{
          label: 'Distribución de Clases',
          data: classCounts,
          backgroundColor: colors.slice(0, files.length),
          borderColor: colors.slice(0, files.length).map(c => c.replace('0.8', '1')),
          borderWidth: 2,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: true, position: 'bottom' },
        },
      },
    });

    this.charts.set('classDistribution', chart);
  }
}
