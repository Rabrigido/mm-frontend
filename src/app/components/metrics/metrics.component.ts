import { Component, Input, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MetricsService } from '../../services/metrics.service';

type TabState = {
  loading: boolean;
  error?: string;
  data?: any;
};

@Component({
  selector: 'app-metrics',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './metrics.component.html',

})
export class MetricsComponent implements OnInit {
  private svc = inject(MetricsService);

  @Input({ required: true }) repoId!: string;
  /** Ej: ['files', 'classes-per-file', 'file-coupling', 'function-coupling'] */
  @Input({ required: true }) metrics!: string[];

  activeIndex = signal(0);
  tabs = signal<string[]>([]);
  states = new Map<string, TabState>();

  ngOnInit(): void {
    this.tabs.set(this.metrics ?? []);
    for (const m of this.tabs()) this.states.set(m, { loading: false });
    // carga perezosa: al iniciar, carga la primera pestaña
    const first = this.tabs()[0];
    if (first) this.loadMetric(first);
  }

  selectTab(i: number) {
    this.activeIndex.set(i);
    const metric = this.tabs()[i];
    if (metric) this.loadMetric(metric, /*force*/ false);
  }

  reloadActive() {
    const metric = this.tabs()[this.activeIndex()];
    if (metric) this.loadMetric(metric, /*force*/ true);
  }

  private loadMetric(metric: string, force = false) {
    const st = this.states.get(metric)!;
    if (!force && st.data && !st.error) return; // ya cargado
    st.loading = true;
    st.error = undefined;
    this.states.set(metric, st);

    this.svc.getMetric(this.repoId, encodeURIComponent(metric)).subscribe({
      next: (data) => {
        this.states.set(metric, { loading: false, data });
      },
      error: (err) => {
        const msg = err?.error?.error || err?.message || 'Error al obtener la métrica';
        this.states.set(metric, { loading: false, error: msg });
      },
    });
  }

  stateOf(metric: string): TabState {
    return this.states.get(metric) ?? { loading: false };
  }

  asPrettyJSON(obj: any): string {
    return JSON.stringify(obj, null, 2);
  }
}
