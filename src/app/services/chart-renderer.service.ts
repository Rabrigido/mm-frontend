import { Injectable } from '@angular/core';
import * as echarts from 'echarts';

/**
 * Handles ECharts rendering for generic metrics data.
 * Extracts numeric data, applies heuristics, and renders bar charts.
 */
@Injectable({ providedIn: 'root' })
export class ChartRendererService {
  private charts = new Map<string, echarts.ECharts>();
  private resizeBound = false;
  private readonly resizeHandler = () => {
    for (const ch of this.charts.values()) ch.resize();
  };

  /**
   * Renders a bar chart for the given metric data.
   * Returns 'ok' | 'empty' | 'error' status.
   */
  renderChart(
    chartKey: string,
    data: any,
    containerId: string
  ): 'ok' | 'empty' | 'error' {
    try {
      // Extract numeric pairs from data
      const pairs = this.extractNumericPairs(data);

      // If empty, try heuristic approach
      if (pairs.length === 0 && data && typeof data === 'object') {
        const inferred = this.inferNumericPairs(data);
        if (inferred.length === 0) return 'empty';
        pairs.push(...inferred);
      }

      if (pairs.length === 0) return 'empty';

      // Get top 20 items and sort
      pairs.sort((a, b) => b.value - a.value);
      const top = pairs.slice(0, 20);
      const names = top.map(d => d.name);
      const values = top.map(d => d.value);

      // Get or create chart
      const el = document.getElementById(containerId);
      if (!el) return 'error';

      let chart = this.charts.get(chartKey);
      if (!chart) {
        chart = echarts.init(el);
        this.charts.set(chartKey, chart);
      }

      // Configure chart
      chart.setOption({
        tooltip: { trigger: 'axis' },
        grid: { left: 12, right: 12, top: 24, bottom: 48, containLabel: true },
        xAxis: { type: 'category', data: names, axisLabel: { rotate: 45, fontSize: 10 } },
        yAxis: { type: 'value' },
        series: [{ type: 'bar', data: values }],
      });

      this.ensureResizeListener();
      return 'ok';
    } catch {
      return 'error';
    }
  }

  /**
   * Extracts numeric key-value pairs from first level of object.
   */
  private extractNumericPairs(
    data: any
  ): Array<{ name: string; value: number }> {
    const pairs: Array<{ name: string; value: number }> = [];

    if (data && typeof data === 'object' && !Array.isArray(data)) {
      for (const k of Object.keys(data)) {
        const v = (data as any)[k];
        if (typeof v === 'number' && Number.isFinite(v)) {
          pairs.push({ name: k, value: v });
        }
      }
    }

    return pairs;
  }

  /**
   * Attempts to infer numeric values from nested objects
   * by checking for common field names (count, fanIn, fanOut, etc.)
   */
  private inferNumericPairs(
    data: any
  ): Array<{ name: string; value: number }> {
    const candFields = ['count', 'fanIn', 'fanOut', 'size', 'lines', 'total', 'degree'];
    const inferred: Array<{ name: string; value: number }> = [];

    for (const k of Object.keys(data)) {
      const v = (data as any)[k];
      if (v && typeof v === 'object') {
        const f = candFields.find(
          fk => typeof v[fk] === 'number' && Number.isFinite(v[fk])
        );
        if (f) inferred.push({ name: k, value: v[f] });
      }
    }

    return inferred;
  }

  /**
   * Disposes chart and removes from cache.
   */
  disposeChart(chartKey: string): void {
    const chart = this.charts.get(chartKey);
    if (chart) {
      chart.dispose();
      this.charts.delete(chartKey);
    }
  }

  /**
   * Disposes all charts and cleans up.
   */
  disposeAll(): void {
    for (const ch of this.charts.values()) ch.dispose();
    this.charts.clear();
    this.removeResizeListener();
  }

  /**
   * Triggers resize for all charts.
   */
  resizeAll(): void {
    for (const ch of this.charts.values()) ch.resize();
  }

  private ensureResizeListener(): void {
    if (!this.resizeBound) {
      window.addEventListener('resize', this.resizeHandler, { passive: true });
      this.resizeBound = true;
    }
  }

  private removeResizeListener(): void {
    if (this.resizeBound) {
      window.removeEventListener('resize', this.resizeHandler);
      this.resizeBound = false;
    }
  }
}
