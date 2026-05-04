import { Component, inject, signal, OnDestroy } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { ReposService } from '../../services/repos.service';
import { Repo } from '../../models/repo';
import { ScanResult } from '../../models/scan-result';

import { ReportsNavbarComponent, ReportKey } from '../../shared/components/reports-navbar/reports-navbar.component';
import { Input } from '@angular/core';
import { Observable } from 'rxjs';

import { HierarchicalGraphComponent } from '../../components/hierarchical-graph/hierarchical-graph.component';
import { ModuleClassGraphComponent } from '../../components/module-class-graph/module-class-graph.component';
import { ModuleFunctionGraphComponent } from '../../components/module-function-graph/module-function-graph.component';
import { MetricsTabsComponent } from './metrics-tabs.component';
import { ChartRendererService } from '../../services/chart-renderer.service';

/**
 * Main page for repository details and metrics visualization.
 * Orchestrates data loading, scanning, and delegation to specialized components.
 */
@Component({
  selector: 'app-repo-detail-page',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    ReportsNavbarComponent,
    HierarchicalGraphComponent,
    ModuleClassGraphComponent,
    ModuleFunctionGraphComponent,
    MetricsTabsComponent
  ],
  templateUrl: './repo-detail-page.component.html',
})
export class RepoDetailPageComponent implements OnDestroy {
  private route = inject(ActivatedRoute);
  private reposService = inject(ReposService);
  private chartRenderer = inject(ChartRendererService);

  // Repo and scan data
  repo = signal<Repo | null>(null);
  scan = signal<ScanResult | null>(null);
  loading = signal(false);
  error = signal<string | null>(null);
  id = this.route.snapshot.paramMap.get('id')!;

  @Input() loader?: () => Observable<string[]>;

  // Report selection
  selectedReport = signal<ReportKey | null>(null);

  ngOnInit() {
    this.load();
  }

  ngOnDestroy() {
    this.chartRenderer.disposeAll();
  }

  /**
   * Gets all metric keys from the current scan result.
   */
  getMetricKeys(): string[] {
    const s = this.scan();
    const mm: any = s?.modularityMetrics ?? {};
    if (!mm || typeof mm !== 'object') return [];
    return Object.keys(mm);
  }

  /**
   * Gets all metrics data as a map for child components.
   */
  getMetricsData(): Record<string, any> {
    const s = this.scan();
    const mm: any = s?.modularityMetrics ?? {};
    return mm || {};
  }

  /**
   * Helper: Convert object to keys array (for template use).
   */
  objectKeys = (o: Record<string, unknown>) => Object.keys(o ?? {});

  /**
   * Checks if files metric is available in the scan.
   */
  hasFilesMetric(): boolean {
    const s = this.scan();
    const mm: any = s?.modularityMetrics ?? {};
    const files = mm?.['../../../../files'];
    if (!files) return false;
    return (Array.isArray(files) && files.length > 0) ||
      (files && Array.isArray(files.result) && files.result.length > 0);
  }

  // ====== Data Loading ======

  /**
   * Loads repo metadata.
   */
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

  /**
   * Runs repository scan and loads metrics.
   */
  runScan() {
    this.loading.set(true);
    this.error.set(null);
    this.reposService.scanRepo(this.id).subscribe({
      next: (res) => {
        // Clear previous charts
        this.chartRenderer.disposeAll();
        this.scan.set(res);
        this.loading.set(false);
      },
      error: (e) => {
        this.error.set(e?.error?.message ?? 'No se pudo ejecutar el scanner');
        this.loading.set(false);
      },
    });
  }

  /**
   * Downloads the current scan result as JSON file.
   */
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
}
