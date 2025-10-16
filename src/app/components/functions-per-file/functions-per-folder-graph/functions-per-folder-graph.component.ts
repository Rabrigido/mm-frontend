// src/app/components/functions-per-folder-graph/functions-per-folder-graph.component.ts
import {
  AfterViewInit,
  Component,
  ElementRef,
  Input,
  OnChanges,
  OnDestroy,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import * as echarts from 'echarts';


type Node = {
  name: string;
  path: string;
  value?: number;       // número de funciones (en hojas: archivo)
  children?: Node[];    // carpetas
};

@Component({
  selector: 'functions-per-folder-graph',
  standalone: true,
  templateUrl: './functions-per-folder-graph.component.html',
  styleUrls: ['./functions-per-folder-graph.component.css'],
})
export class FunctionsPerFolderGraphComponent implements AfterViewInit, OnChanges, OnDestroy {
  /** Mapea filePath -> { fnName: ASTNode, ... } */
  @Input({ required: true })
  data!: Record<string, Record<string, unknown>>;

  /** 'treemap' | 'sunburst' */
  @Input() chartType: 'treemap' | 'sunburst' = 'treemap';

  /** alto mínimo opcional del chart */
  @Input() minHeight = 420;

  /** nombre de la raíz si se quiere fijar */
  @Input() rootName?: string;

  @ViewChild('chart', { static: true }) chartEl!: ElementRef<HTMLDivElement>;
  private chart?: echarts.ECharts;
  private ro?: ResizeObserver;

  ngAfterViewInit(): void {
    this.chart = echarts.init(this.chartEl.nativeElement);
    this.chartEl.nativeElement.style.minHeight = `${this.minHeight}px`;
    this.renderFromInput();
    this.ro = new ResizeObserver(() => this.chart?.resize());
    this.ro.observe(this.chartEl.nativeElement);
  }

  ngOnChanges(ch: SimpleChanges): void {
    if (!this.chart) return; // aún no está inicializado
    if (ch['data'] || ch['chartType'] || ch['rootName']) {
      this.renderFromInput();
    }
  }

  private renderFromInput() {
    const result = this.data ?? {};
    const root = this.buildHierarchy(result);
    this.render(root);
  }

  /** Convierte { filePath: {fnName:…} } a jerarquía de carpetas */
  private buildHierarchy(result: Record<string, Record<string, unknown>>): Node {
    const entries = Object.entries(result)
      .map(([file, fns]) => ({
        path: file.replace(/\\/g, '/'),
        count: Object.keys(fns ?? {}).length,
      }))
      .filter((e) => e.count > 0);

    const common = this.commonPrefix(entries.map((e) => e.path));
    const trimmed = entries.map((e) => ({
      path: e.path.slice(common.length).replace(/^\/+/, ''),
      count: e.count,
    }));

    const root: Node = {
      name: this.rootName ?? (trimmed.length ? this.prettyRoot(common) : 'root'),
      path: '',
      children: [],
    };

    for (const { path, count } of trimmed) {
      const parts = path.split('/').filter(Boolean);
      let cur = root;
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        const isLeaf = i === parts.length - 1;
        cur.children ??= [];
        let child = cur.children.find((c) => c.name === part);
        if (!child) {
          child = {
            name: part,
            path: (cur.path ? cur.path + '/' : '') + part,
            children: isLeaf ? undefined : [],
          };
          cur.children.push(child);
        }
        if (isLeaf) {
          child.value = count;
        } else {
          cur = child;
        }
      }
    }

    this.sumFolderValues(root);
    return root;
  }

  private sumFolderValues(node: Node): number {
    if (!node.children || node.children.length === 0) return node.value ?? 0;
    let sum = 0;
    for (const ch of node.children) sum += this.sumFolderValues(ch);
    node.value = sum;
    return sum;
  }

  private commonPrefix(paths: string[]): string {
    if (!paths.length) return '';
    const first = paths[0];
    let end = first.length;
    for (let i = 1; i < paths.length; i++) {
      end = Math.min(end, this.lcpLen(first, paths[i]));
      if (end === 0) break;
    }
    const cut = first.lastIndexOf('/', end);
    return cut >= 0 ? first.slice(0, cut + 1) : '';
  }
  private lcpLen(a: string, b: string): number {
    const n = Math.min(a.length, b.length);
    let i = 0;
    while (i < n && a[i] === b[i]) i++;
    return i;
  }
  private prettyRoot(common: string): string {
    const clean = common.replace(/\\/g, '/').replace(/\/$/, '');
    const last = clean.split('/').filter(Boolean).pop();
    return last ?? 'root';
  }

  private render(root: Node) {
    if (!this.chart) return;

    const baseTooltip = {
      trigger: 'item',
      formatter: (info: any) => {
        const path = this.breadcrumb(info);
        const value = info.value ?? 0;
        return `<div style="max-width:320px">
          <div><b>${info.name}</b></div>
          <div>${path}</div>
          <div><small>Funciones: ${value}</small></div>
        </div>`;
      },
    };

    if (this.chartType === 'sunburst') {
      const option: echarts.EChartsOption = {
        tooltip: baseTooltip as any,
        series: [
          {
            type: 'sunburst',
            radius: ['10%', '90%'],

            emphasis: { focus: 'ancestor' },
            levels: [
              {}, // root
              { r0: '10%', r: '35%', label: { rotate: 'radial' } },
              { r0: '35%', r: '70%', label: { rotate: 'radial' } },
              { r0: '70%', r: '90%', label: { rotate: 'radial' } },
            ],
            data: root.children ?? [],
          },
        ],
      };
      (this.chart as any).setOption(option, true);
    } else {
      const option: echarts.EChartsOption = {
        tooltip: baseTooltip as any,
        series: [
          {
            type: 'treemap',
            roam: true,
            breadcrumb: { show: true },
            leafDepth: 2,
            label: { show: true, formatter: '{b}\n{c}' },
            upperLabel: { show: true, height: 22 },
            levels: [
              {
                itemStyle: { borderColor: '#fff', borderWidth: 2, gapWidth: 2 },
                upperLabel: { show: true },
              },
              {
                itemStyle: { gapWidth: 1 },
                colorSaturation: [0.25, 0.85],
              },
              {
                colorSaturation: [0.25, 0.85],
              },
            ],
            data: root.children ?? [],
          } as any,
        ],
      };
      (this.chart as any).setOption(option, true);
    }
  }

  private breadcrumb(info: any): string {
    const treePathInfo = info.treePathInfo as Array<{ name: string }>;
    if (!treePathInfo) return info.name ?? '';
    const parts = treePathInfo.map((p) => p.name).filter(Boolean);
    return parts.join(' / ');
  }

  ngOnDestroy(): void {
    this.ro?.disconnect();
    this.chart?.dispose();
  }
}
