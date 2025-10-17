import {
  AfterViewInit,
  Component,
  DestroyRef,
  ElementRef,
  Input,
  OnChanges,
  OnDestroy,
  SimpleChanges,
  ViewChild,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import * as d3 from 'd3';
import * as echarts from 'echarts';

type LocRow = {
  path: string;   // ruta relativa
  loc: number;    // líneas totales
  sloc: number;   // líneas efectivas
  ext?: string;   // extensión/lenguaje, ej: ".ts"
};

type Node = {
  name: string;
  path: string;
  value?: number;     // valor para el treemap (depende de la métrica seleccionada)
  children?: Node[];  // carpetas
};

type Mode = 'LOC' | 'SLOC' | 'RATIO' | 'COMMENTS';

@Component({
  selector: 'app-loc-sloc-graphs',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './loc-sloc-chart.component.html',
})
export class LocSlocGraphsComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input({ required: true }) data: LocRow[] = [];

  @ViewChild('barEl',  { static: true }) barRef!: ElementRef<HTMLDivElement>;
  @ViewChild('treeEl', { static: true }) treeRef!: ElementRef<HTMLDivElement>;

  private barChart?: echarts.ECharts;
  private treeChart?: echarts.ECharts;
  private destroyRef = inject(DestroyRef);

  // NUEVO: modo seleccionado para el treemap
  mode: Mode = 'SLOC';

  ngAfterViewInit(): void {
    this.initCharts();
    this.renderAll();

    const onResize = () => {
      this.barChart?.resize();
      this.treeChart?.resize();
    };
    window.addEventListener('resize', onResize);
    this.destroyRef.onDestroy(() => window.removeEventListener('resize', onResize));
  }

  ngOnChanges(_: SimpleChanges): void {
    this.renderAll();
  }

  ngOnDestroy(): void {
    this.barChart?.dispose();
    this.treeChart?.dispose();
  }

  // ---------- helpers ----------
  private initCharts() {
    if (!this.barChart)  this.barChart  = echarts.init(this.barRef.nativeElement);
    if (!this.treeChart) this.treeChart = echarts.init(this.treeRef.nativeElement);
  }

  private renderAll() {
    if (!this.data?.length) return;
    if (this.barChart)  this.renderBars();
    if (this.treeChart) this.renderTreemap(); // usa this.mode
  }

  // ---------- Barras apiladas por lenguaje ----------
  private renderBars() {
    const extFromPath = (p: string) => {
      const i = p.lastIndexOf('.');
      return i >= 0 ? p.slice(i) : '(sin ext)';
    };

    const byLang = d3.rollup(
      this.data,
      rows => ({
        loc: d3.sum(rows, r => r.loc ?? 0),
        sloc: d3.sum(rows, r => r.sloc ?? 0),
      }),
      (r) => (r.ext ?? extFromPath(r.path) ?? '(sin ext)')
    );

    const langs = Array.from(byLang.keys());
    const locs = langs.map(k => byLang.get(k)!.loc);
    const slocs = langs.map(k => byLang.get(k)!.sloc);
    const gaps = langs.map((_, i) => Math.max(0, locs[i] - slocs[i]));

    const option: echarts.EChartsOption = {
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      legend: { data: ['SLOC', 'Espacios/Comentarios'] },
      grid: { left: 6, right: 10, bottom: 30, top: 30, containLabel: true },
      xAxis: { type: 'category', data: langs },
      yAxis: { type: 'value' },
      series: [
        { name: 'SLOC', type: 'bar', stack: 'total', data: slocs },
        { name: 'Espacios/Comentarios', type: 'bar', stack: 'total', data: gaps },
      ]
    };

    this.barChart!.setOption(option as any, true);
  }

  // ---------- Treemap por carpeta con selector ----------
  onModeChange(v: string) {
    this.mode = (v as Mode);
    this.renderTreemap(); // recalcula y actualiza
  }

  private renderTreemap() {
    const root = this.buildHierarchyFromRows(this.data, this.mode);

    const titleByMode: Record<Mode, string> = {
      LOC: 'Treemap por carpeta — LOC',
      SLOC: 'Treemap por carpeta — SLOC',
      RATIO: 'Treemap por carpeta — SLOC/LOC (%)',
      COMMENTS: 'Treemap por carpeta — COMENTARIOS',
    };

    const unitSuffix = this.mode === 'RATIO' ? '%' : '';

    const option: echarts.EChartsOption = {
      title: { text: titleByMode[this.mode], left: 'center', textStyle: { fontSize: 13 } },
      tooltip: {
        trigger: 'item',
        formatter: (info: any) => {
          const treePathInfo = info.treePathInfo as Array<{ name: string }>;
          const path = treePathInfo?.map(p => p.name).filter(Boolean).join(' / ') ?? info.name;
          const value = info.value ?? 0;
          const isFolder = !!info.children;
          const extra = this.tooltipExtras(info, this.mode);
          return `<div style="max-width:360px">
            <div><b>${info.name}${isFolder ? '/' : ''}</b></div>
            <div>${path}</div>
            <div><small>Valor: ${value}${unitSuffix}</small></div>
            ${extra ? `<div><small>${extra}</small></div>` : ''}
          </div>`;
        }
      },
      series: [
        {
          type: 'treemap',
          roam: true,
          breadcrumb: { show: true },
          upperLabel: { show: true, height: 24, color: '#e4e4e7', fontSize: 12 },
          label: { show: true, formatter: this.mode === 'RATIO' ? '{b}\n{c}%' : '{b}\n{c}', color: '#fff' },
          leafDepth: 2,
          levels: [
            { itemStyle: { borderColor: '#fff', borderWidth: 2, gapWidth: 2 }, upperLabel: { show: true } },
            { itemStyle: { gapWidth: 1 }, colorSaturation: [0.25, 0.85] },
            { colorSaturation: [0.25, 0.85] },
          ],
          data: root.children ?? [],
        } as any,
      ],
    };

    this.treeChart!.setOption(option as any, true);
  }

  /** Texto adicional en tooltip según modo (por ejemplo mostrar loc/sloc) */
  private tooltipExtras(info: any, mode: Mode): string {
    // guardo totales si los inyecto en el nodo
    const m = info?.data?._metrics as { loc?: number; sloc?: number } | undefined;
    if (!m) return '';
    if (mode === 'RATIO') {
      const ratio = m.loc ? (100 * (m.sloc ?? 0) / Math.max(1, m.loc)) : 0;
      return `SLOC: ${m.sloc ?? 0} • LOC: ${m.loc ?? 0} • Ratio: ${ratio.toFixed(1)}%`;
    }
    if (mode === 'COMMENTS') {
      const comments = Math.max(0, (m.loc ?? 0) - (m.sloc ?? 0));
      return `Comentarios/Espacios: ${comments} • SLOC: ${m.sloc ?? 0} • LOC: ${m.loc ?? 0}`;
    }
    return `SLOC: ${m.sloc ?? 0} • LOC: ${m.loc ?? 0}`;
  }

  /**
   * Construye jerarquía y agrega valores según el modo:
   *  - LOC: suma LOC por carpeta.
   *  - SLOC: suma SLOC por carpeta.
   *  - COMMENTS: suma (LOC - SLOC) por carpeta.
   *  - RATIO: promedio ponderado: sum(SLOC)/sum(LOC) * 100 por carpeta.
   */
  private buildHierarchyFromRows(rows: LocRow[], mode: Mode): Node {
    // normalizo paths y calculo métricas base
    const entries = rows
      .map(r => ({
        path: r.path.replace(/\\/g, '/'),
        loc: Math.max(0, r.loc ?? 0),
        sloc: Math.max(0, r.sloc ?? 0),
      }))
      .filter(e => e.loc > 0); // ignoro archivos vacíos

    const common = this.commonPrefix(entries.map(e => e.path));
    const trimmed = entries.map(e => ({
      path: e.path.slice(common.length).replace(/^\/+/, ''),
      loc: e.loc,
      sloc: Math.min(e.sloc, e.loc),
    }));

    const root: Node = { name: this.prettyRoot(common), path: '', children: [] };

    // insertamos hojas y guardamos métricas base en cada nodo (para tooltips y agregación)
    for (const { path, loc, sloc } of trimmed) {
      const parts = path.split('/').filter(Boolean);
      let cur = root;
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        const isLeaf = i === parts.length - 1;
        cur.children ??= [];
        let child = cur.children.find(c => c.name === part);
        if (!child) {
          child = { name: part, path: (cur.path ? cur.path + '/' : '') + part, children: isLeaf ? undefined : [] };
          (child as any)._metrics = { loc: 0, sloc: 0 }; // ← acumuladores
          cur.children.push(child);
        }
        if (isLeaf) {
          (child as any)._metrics = { loc, sloc };
        } else {
          cur = child;
        }
      }
    }

    // agregamos valores por carpeta según modo
    this.aggregateValues(root, mode);
    return root;
  }

  /** Agrega node.value + acumula métricas por carpeta (usa promedio ponderado en RATIO). */
  private aggregateValues(node: Node, mode: Mode): { loc: number; sloc: number } {
    const acc = { loc: 0, sloc: 0 };

    if (!node.children || node.children.length === 0) {
      // hoja => ya tiene _metrics
      const m = (node as any)._metrics as { loc: number; sloc: number } | undefined;
      if (m) {
        acc.loc = m.loc;
        acc.sloc = m.sloc;
        node.value = this.valueForMode(m.loc, m.sloc, mode);
      } else {
        node.value = 0;
      }
      return acc;
    }

    // carpeta => sumar recursivo
    for (const ch of node.children) {
      const c = this.aggregateValues(ch, mode);
      acc.loc += c.loc;
      acc.sloc += c.sloc;
    }

    // guarda acumulados para tooltip
    (node as any)._metrics = { loc: acc.loc, sloc: acc.sloc };
    node.value = this.valueForMode(acc.loc, acc.sloc, mode);
    return acc;
  }

  /** Convierte (loc, sloc) en un valor según el modo */
  private valueForMode(loc: number, sloc: number, mode: Mode): number {
    switch (mode) {
      case 'LOC': return loc;
      case 'SLOC': return sloc;
      case 'COMMENTS': return Math.max(0, loc - sloc);
      case 'RATIO': return loc > 0 ? +(100 * sloc / loc).toFixed(2) : 0; // porcentaje
    }
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
}
