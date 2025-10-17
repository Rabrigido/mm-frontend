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

type LocPoint = { date: string; loc: number; sloc: number }; // opcional para serie temporal

@Component({
  selector: 'app-loc-sloc-graphs',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './loc-sloc-chart.component.html',

  styles: [`
    :host { display:block; }
    .card { @apply bg-neutral-900/30 rounded-2xl p-3; border:1px solid rgba(255,255,255,0.06); }
    .card-title { @apply text-sm font-semibold opacity-80 mb-2; }
    .chart { width:100%; height: 320px; }
    .chart-hint { @apply text-xs opacity-60 mt-2; }
  `]
})
export class LocSlocGraphsComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input({ required: true }) data: LocRow[] = [];
  @Input() history: LocPoint[] = []; // opcional

  @ViewChild('areaEl', { static: true }) areaRef!: ElementRef<HTMLDivElement>;
  @ViewChild('barEl',  { static: true }) barRef!: ElementRef<HTMLDivElement>;
  @ViewChild('treeEl', { static: true }) treeRef!: ElementRef<HTMLDivElement>;

  private areaChart?: echarts.ECharts;
  private barChart?: echarts.ECharts;
  private destroyRef = inject(DestroyRef);

  ngAfterViewInit(): void {
    this.initCharts();
    this.renderAll();
    // responsive
    const onResize = () => {
      this.areaChart?.resize();
      this.barChart?.resize();
      this.renderTreemap(); // d3 recalcula
    };
    window.addEventListener('resize', onResize);
    this.destroyRef.onDestroy(() => window.removeEventListener('resize', onResize));
  }

  ngOnChanges(_: SimpleChanges): void {
    this.renderAll();
  }

  ngOnDestroy(): void {
    this.areaChart?.dispose();
    this.barChart?.dispose();
  }

  // ---------- helpers ----------
  private initCharts() {
    if (!this.areaChart) this.areaChart = echarts.init(this.areaRef.nativeElement);
    if (!this.barChart) this.barChart = echarts.init(this.barRef.nativeElement);
  }

  private renderAll() {
    if (this.areaChart) this.renderArea();
    if (this.barChart) this.renderBars();
    this.renderTreemap();
  }

  // ---------- 1) Area apilada LOC/SLOC ----------
  private renderArea() {
    const points = (this.history ?? []).slice().sort((a,b) => a.date.localeCompare(b.date));
    const dates = points.map(p => p.date);
    const loc = points.map(p => p.loc);
    const sloc = points.map(p => p.sloc);
    const gap = points.map((p) => Math.max(0, (p.loc ?? 0) - (p.sloc ?? 0)));

    const option: any = points.length ? {
      tooltip: { trigger: 'axis' },
      legend: { data: ['SLOC', 'Espacios/Comentarios'] },
      xAxis: { type: 'category', data: dates },
      yAxis: { type: 'value' },
      series: [
        { name: 'SLOC', type: 'line', stack: 'total', areaStyle: {}, data: sloc, smooth: true },
        { name: 'Espacios/Comentarios', type: 'line', stack: 'total', areaStyle: {}, data: gap, smooth: true },
      ]
    } : {
      title: { text: 'Sin datos de historia', left: 'center', top: 'middle', textStyle: { fontSize: 12, opacity: 0.6 } }
    };

    this.areaChart?.setOption(option, true);
  }

  // ---------- 2) Barras apiladas por lenguaje ----------
  private renderBars() {
    const ext = (p: string) => {
      const i = p.lastIndexOf('.');
      return i >= 0 ? p.slice(i) : '(sin ext)';
    };

    const byLang = d3.rollup(
      this.data,
      rows => ({
        loc: d3.sum(rows, r => r.loc ?? 0),
        sloc: d3.sum(rows, r => r.sloc ?? 0),
      }),
      (r) => (r.ext ?? ext(r.path) ?? '(sin ext)')
    );

    const langs = Array.from(byLang.keys());
    const locs = langs.map(k => byLang.get(k)!.loc);
    const slocs = langs.map(k => byLang.get(k)!.sloc);
    const gaps = langs.map((_, i) => Math.max(0, locs[i] - slocs[i]));

    const option: any = {
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

    this.barChart?.setOption(option, true);
  }

  // ---------- 3) Treemap por carpeta con D3 ----------
  private renderTreemap() {
    const el = this.treeRef.nativeElement;
    d3.select(el).selectAll('*').remove();

    if (!this.data?.length) {
      d3.select(el).append('div').style('opacity', 0.6).style('font-size', '12px')
        .style('text-align','center').style('margin-top','8px')
        .text('Sin datos');
      return;
    }

    // construir jerarquía simple por ruta
    type Node = { name: string; children?: Node[]; value?: number; path?: string; };
    const root: Node = { name: 'root', children: [] };

    for (const r of this.data) {
      const parts = r.path.split('/').filter(Boolean);
      let curr = root;
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        if (i === parts.length - 1) {
          (curr.children ??= []).push({ name: part, value: r.loc, path: r.path });
        } else {
          let next = (curr.children ??= []).find(c => c.name === part);
          if (!next) { next = { name: part, children: [] }; curr.children!.push(next); }
          curr = next;
        }
      }
    }

    const width = el.clientWidth || 360;
    const height = el.clientHeight || 320;
    const svg = d3.select(el).append('svg').attr('width', width).attr('height', height);

    const rootH = d3.hierarchy(root).sum(d => d.value ?? 0).sort((a,b)=> (b.value??0) - (a.value??0));
    d3.treemap<Node>().size([width, height]).paddingInner(2)(rootH as any);

    const color = d3.scaleSequential(d3.interpolateTurbo).domain([0, (rootH.value ?? 1)]);

    const nodes = svg.selectAll('g')
      .data(rootH.leaves())
      .enter().append('g')
      .attr('transform', d => `translate(${(d as any).x0},${(d as any).y0})`);

    nodes.append('rect')
      .attr('width', d => Math.max(0, (d as any).x1 - (d as any).x0))
      .attr('height', d => Math.max(0, (d as any).y1 - (d as any).y0))
      .attr('rx', 8)
      .attr('fill', d => color((d as any).value ?? 0) as string)
      .append('title')
      .text(d => `${(d as any).data.path}\nLOC: ${(d as any).value}`);

    nodes.append('text')
      .attr('x', 6).attr('y', 16)
      .attr('fill', 'white').attr('font-size', 11)
      .text(d => (d as any).data.name)
      .each(function(d) {
        const rectW = Math.max(0, (d as any).x1 - (d as any).x0);
        const self = d3.select(this);
        if ((self.node() as SVGTextElement).getComputedTextLength() > rectW - 8) {
          self.text((d as any).data.name.slice(0, Math.max(1, Math.floor((rectW-12)/7))) + '…');
        }
      });
  }
}
