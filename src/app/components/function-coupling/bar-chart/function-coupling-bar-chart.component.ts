// ===============================
// file: src/app/components/function-coupling/function-coupling-bar-chart.component.ts
// ===============================
import { Component, OnInit, OnDestroy, ElementRef, Input, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Chart, registerables } from 'chart.js';
import { MetricsService } from '../../../services/metrics.service';

Chart.register(...registerables);

interface NodeData {
  id: string;        // `${file}::${fn}`
  label: string;     // function name
  file: string;      // file path
  fanIn: number;
  fanOut: number;
}

interface FunctionEntry {
  type: string;
  ['fan-out']?: Record<string, number>;
  ['fan-in']?: Record<string, number>;
}

interface FunctionCouplingResult {
  name: string;
  description: string;
  result: Record<string, Record<string, FunctionEntry>>;
  status: boolean;
}

@Component({
  selector: 'app-function-coupling-bar-chart',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './function-coupling-bar-chart.component.html'
})
export class FunctionCouplingBarChartComponent implements OnInit, OnDestroy {
  private metricsService = inject(MetricsService);
  private el = inject(ElementRef);

  @Input({ required: true }) repoId!: string;

  loading = signal(false);
  error = signal<string | null>(null);
  currentPage = signal(0);

  private chart: Chart | null = null;
  private allNodes: NodeData[] = [];

  ngOnInit(): void {
    this.loadData();
  }

  ngOnDestroy(): void {
    if (this.chart) this.chart.destroy();
  }

  // --------------------------
  // Data loading + shaping
  // --------------------------
  private loadData() {
    this.loading.set(true);
    this.error.set(null);

    this.metricsService.getMetric(this.repoId, 'function-coupling').subscribe({
      next: (data: FunctionCouplingResult | any) => {
        try {
          const result = data?.result as Record<string, Record<string, FunctionEntry>>;
          if (!result) throw new Error('No data received');

          this.allNodes = this.buildNodes(result);
          this.currentPage.set(0);
          this.renderBarChart(this.allNodes);
          this.loading.set(false);
        } catch (e: any) {
          this.error.set(e?.message ?? 'Error procesando los datos');
          this.loading.set(false);
        }
      },
      error: (err: unknown) => {
        const message = err instanceof Error ? err.message : 'Error al cargar la métrica de acoplamiento de funciones';
        this.error.set(message);
        this.loading.set(false);
      }
    });
  }

  private buildNodes(result: Record<string, Record<string, FunctionEntry>>): NodeData[] {
    const nodesMap = new Map<string, NodeData>();
    const key = (file: string, fn: string) => `${file}::${fn}`;

    for (const file of Object.keys(result)) {
      for (const fnName of Object.keys(result[file])) {
        const fnData = result[file][fnName];
        const id = key(file, fnName);

        if (!nodesMap.has(id)) {
          nodesMap.set(id, { id, label: fnName, file, fanIn: 0, fanOut: 0 });
        }

        const fanOut = fnData['fan-out'] || {};
        for (const callee of Object.keys(fanOut)) {
          const intensity = fanOut[callee] ?? 1;
          nodesMap.get(id)!.fanOut += intensity;

          // fan-in del callee (si existe resuelto por nombre en el mismo archivo, si no, crea nodo por nombre)
          const calleeId = this.resolveFunctionId(result, callee) || key(file, callee);
          if (!nodesMap.has(calleeId)) {
            const [tFile, tFn] = calleeId.includes('::') ? calleeId.split('::') : [file, callee];
            nodesMap.set(calleeId, { id: calleeId, label: tFn, file: tFile, fanIn: 0, fanOut: 0 });
          }
          nodesMap.get(calleeId)!.fanIn += intensity;
        }
      }
    }

    return Array.from(nodesMap.values());
  }

  /** Si un nombre aparece en un único archivo, lo resuelve a `${file}::${fn}`; si es ambiguo, retorna null */
  private resolveFunctionId(result: Record<string, Record<string, FunctionEntry>>, fnName: string): string | null {
    const files = Object.keys(result).filter(f => Object.prototype.hasOwnProperty.call(result[f], fnName));
    return files.length === 1 ? `${files[0]}::${fnName}` : null;
  }

  // --------------------------
  // Chart.js (bar horizontal)
  // --------------------------
  private renderBarChart(nodes: NodeData[]) {
    const canvas: HTMLCanvasElement | null = this.el.nativeElement.querySelector('#functionCouplingBarChart');
    if (!canvas) return;

    if (this.chart) this.chart.destroy();

    const itemsPerPage = 10;
    const sorted = [...nodes].sort((a, b) => (b.fanIn + b.fanOut) - (a.fanIn + a.fanOut));
    const startIdx = this.currentPage() * itemsPerPage;
    const endIdx = startIdx + itemsPerPage;
    const pageNodes = sorted.slice(startIdx, endIdx);

    const labels = pageNodes.map(n => n.label);
    const fanIn = pageNodes.map(n => n.fanIn);
    const fanOut = pageNodes.map(n => n.fanOut);
    const totalPages = Math.ceil(sorted.length / itemsPerPage) || 1;

    this.chart = new Chart(canvas.getContext('2d')!, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'Fan-In', data: fanIn, backgroundColor: '#2196F3', borderColor: '#1976D2', borderWidth: 1 },
          { label: 'Fan-Out', data: fanOut, backgroundColor: '#FF9800', borderColor: '#F57C00', borderWidth: 1 }
        ]
      },
      options: {
        plugins: {
          title: {
            display: true,
            text: `Function Coupling (Fan-In vs Fan-Out) — Página ${this.currentPage() + 1} de ${totalPages}`,
            font: { size: 14, weight: 'bold' }
          },
          legend: { position: 'top' }
        },
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: 'y',
        scales: {
          x: { beginAtZero: true }
        }
      }
    });
  }

  // --------------------------
  // Paginación
  // --------------------------
  nextPage() {
    const itemsPerPage = 10;
    const totalPages = Math.ceil(this.allNodes.length / itemsPerPage) || 1;
    if (this.currentPage() < totalPages - 1) {
      this.currentPage.update(p => p + 1);
      this.renderBarChart(this.allNodes);
    }
  }

  previousPage() {
    if (this.currentPage() > 0) {
      this.currentPage.update(p => p - 1);
      this.renderBarChart(this.allNodes);
    }
  }
}
