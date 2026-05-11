import { CommonModule } from '@angular/common';
import { Component, Input, Output, EventEmitter } from '@angular/core';
import { MetricsTabsComponent } from './metrics-tabs.component';
import { Repo } from '../../../models/repo';
import { ScanResult } from '../../../models/scan-result';
import { colors, spacing, typography, components } from '../../../design-system';

@Component({
  selector: 'app-details-component',
  standalone: true,
  imports: [CommonModule, MetricsTabsComponent],
  templateUrl: './details.component.html',
})
export class DetailsComponent {
  @Input() isOpen = false;
  @Input() repo: Repo | null = null;
  @Input() scan: ScanResult | null = null;
  @Input() loading = false;
  @Input() error: string | null = null;
  @Output() close = new EventEmitter<void>();
  @Output() runScan = new EventEmitter<void>();
  @Output() downloadScanJson = new EventEmitter<void>();

  colors = colors;
  spacing = spacing;
  typography = typography;
  components = components;

  objectKeys(o: Record<string, unknown>): string[] {
    return Object.keys(o ?? {});
  }

  getMetricKeys(): string[] {
    const mm: any = this.scan?.modularityMetrics ?? {};
    if (!mm || typeof mm !== 'object') return [];
    return Object.keys(mm);
  }

  getMetricsData(): Record<string, any> {
    const mm: any = this.scan?.modularityMetrics ?? {};
    return mm || {};
  }

  stopPropagation(event: Event): void {
    event.stopPropagation();
  }
}
