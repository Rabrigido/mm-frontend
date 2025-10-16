import {
  AfterViewInit,
  Component,
  DestroyRef,
  ElementRef,
  Input,
  OnChanges,
  SimpleChanges,
  ViewChild,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import * as d3 from 'd3';

type AstLike = {
  type?: string;
  async?: boolean;
  params?: any[];
};
type RawResult = Record<string, Record<string, AstLike>>;

type StackedRow = {
  category: 'Declaration' | 'Expression' | 'Arrow';
  Async: number;
  Sync: number;
  total: number;
};

@Component({
  selector: 'app-functions-bar-chart',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './functions-bar-chart.component.html',
  styleUrls: ['./functions-bar-chart.component.css'],
})
export class FunctionsBarChartComponent implements AfterViewInit, OnChanges {
  @Input() title = 'Tipos de función (Async/Sync)';
  /** Pásame el result crudo de la métrica (lo más simple) */
  @Input() rawResult?: RawResult;
  /** Si prefieres, puedes pasar ya los totales por categoría (se ignora rawResult si esto viene). */
  @Input() data?: StackedRow[];

  @Input() margin = { top: 30, right: 16, bottom: 40, left: 56 };

  @ViewChild('host', { static: true }) hostRef!: ElementRef<HTMLDivElement>;

  private destroyRef = inject(DestroyRef);
  private svg?: d3.Selection<SVGSVGElement, unknown, null, undefined>;
  private g?: d3.Selection<SVGGElement, unknown, null, undefined>;
  private tooltip?: d3.Selection<HTMLDivElement, unknown, null, undefined>;
  private resizeObs?: ResizeObserver;

  ngAfterViewInit(): void {
    this.createBase();
    this.render();
    this.setupResizeObserver();
  }

  ngOnChanges(_: SimpleChanges): void {
    if (this.svg) this.render();
  }

  private setupResizeObserver() {
    this.resizeObs = new ResizeObserver(() => this.render());
    this.resizeObs.observe(this.hostRef.nativeElement);
    this.destroyRef.onDestroy(() => this.resizeObs?.disconnect());
  }

  private createBase() {
    const host = this.hostRef.nativeElement;
    d3.select(host).selectAll('svg').remove();
    d3.select(host).selectAll('.tooltip').remove();

    this.svg = d3.select(host).append('svg').attr('class', 'chart-svg');
    this.g = this.svg.append('g').attr('class', 'chart-inner');
    this.tooltip = d3.select(host).append('div').attr('class', 'tooltip').style('opacity', 0);
  }

  private aggregate(): StackedRow[] {
    if (this.data && this.data.length) return this.data;

    const base: Record<StackedRow['category'], { Async: number; Sync: number }> = {
      Declaration: { Async: 0, Sync: 0 },
      Expression: { Async: 0, Sync: 0 },
      Arrow: { Async: 0, Sync: 0 },
    };

    const res = this.rawResult || {};
    for (const file of Object.keys(res)) {
      const fns = res[file] ?? {};
      for (const fname of Object.keys(fns)) {
        const node = fns[fname] ?? {};
        const t = (node.type ?? '').toLowerCase();
        const isAsync = !!node.async;
        let cat: StackedRow['category'] | null = null;

        if (t.includes('arrow')) cat = 'Arrow';
        else if (t.includes('declaration')) cat = 'Declaration';
        else if (t.includes('expression')) cat = 'Expression';

        if (cat) {
          if (isAsync) base[cat].Async++;
          else base[cat].Sync++;
        }
      }
    }

    return (['Declaration', 'Expression', 'Arrow'] as StackedRow['category'][]).map((category) => {
      const Async = base[category].Async;
      const Sync = base[category].Sync;
      return { category, Async, Sync, total: Async + Sync };
    });
  }

  private render() {
    if (!this.svg || !this.g) return;

    const host = this.hostRef.nativeElement;
    const { width: hostW } = host.getBoundingClientRect();
    const width = Math.max(360, hostW);
    const height = 300;
    const { top, right, bottom, left } = this.margin;

    this.svg.attr('width', width).attr('height', height);
    this.g.attr('transform', `translate(${left},${top})`);

    const w = width - left - right;
    const h = height - top - bottom;

    const rows = this.aggregate();
    const keys = ['Async', 'Sync'] as const;

    // scales
    const x = d3
      .scaleBand<string>()
      .domain(rows.map((d) => d.category))
      .range([0, w])
      .padding(0.25);

    const y = d3
      .scaleLinear()
      .domain([0, Math.max(1, d3.max(rows, (d) => d.total) ?? 0)])
      .range([h, 0])
      .nice();

    const color = d3.scaleOrdinal<string>().domain(keys as unknown as string[]).range(['#6ea8fe', '#cfe2ff']);

    // axes
    this.g.selectAll('.axis').remove();
    this.g.append('g').attr('class', 'axis axis-x').attr('transform', `translate(0,${h})`).call(d3.axisBottom(x));
    this.g.append('g').attr('class', 'axis axis-y').call(d3.axisLeft(y).ticks(5).tickFormat(d3.format('d') as any));

    // title
    this.g.selectAll('.title').remove();
    this.g.append('text').attr('class', 'title').attr('x', 0).attr('y', -8).text(this.title);

    // stack data
    const stack = d3.stack<StackedRow>().keys(keys as unknown as string[]).value((d, key) => (d as any)[key]);
    const series = stack(rows);

    // groups per key
    const t = this.svg.transition().duration(350);
    this.g.selectAll('.layer').remove();
    const layer = this.g.selectAll('.layer').data(series, (s: any) => s.key as any);
    const layerEnter = layer.enter().append('g').attr('class', 'layer').attr('fill', (d: any) => color(d.key)!);

    // rects
    const rects = layerEnter
      .selectAll('rect')
      .data((d: any) => d, (dp: any) => (dp.data as StackedRow).category);

    rects
      .enter()
      .append('rect')
      .attr('x', (d: any) => x(d.data.category)!)
      .attr('y', h)
      .attr('width', x.bandwidth())
      .attr('height', 0)
      .on('mousemove', (event: MouseEvent, d: any) => {
        const key = (d3.select((event.currentTarget as any).parentNode).datum() as any).key as 'Async' | 'Sync';
        const val = d.data[key];
        const total = d.data.total;
        const pct = total ? Math.round((val / total) * 100) : 0;
        const [px, py] = d3.pointer(event, this.hostRef.nativeElement);
        this.tooltip!
          .style('opacity', 1)
          .style('left', `${px + 10}px`)
          .style('top', `${py - 10}px`)
          .html(`
            <div class="tt-name">${d.data.category} — ${key}</div>
            <div class="tt-val"><strong>${val}</strong> funciones (${pct}%)</div>
            <div class="tt-sub">Total categoría: ${total}</div>
          `);
      })
      .on('mouseleave', () => this.tooltip?.style('opacity', 0))
      .transition(t as any)
      .attr('y', (d: any) => y(d[1]))
      .attr('height', (d: any) => Math.max(0, y(d[0]) - y(d[1])));

    // labels de total arriba de cada barra
    this.g.selectAll('.bar-total').remove();
    this.g
      .selectAll('.bar-total')
      .data(rows)
      .enter()
      .append('text')
      .attr('class', 'bar-total')
      .attr('text-anchor', 'middle')
      .attr('x', (d) => x(d.category)! + x.bandwidth() / 2)
      .attr('y', (d) => y(d.total) - 6)
      .text((d) => (d.total > 0 ? d.total.toString() : ''));

    // leyenda
    this.drawLegend(color);
  }

  private drawLegend(color: d3.ScaleOrdinal<string, string>) {
    // legend simple arriba-derecha
    this.g!.selectAll('.legend').remove();
    const legend = this.g!.append('g').attr('class', 'legend').attr('transform', 'translate(0,-22)');

    const items = [
      { key: 'Async', x: 220 },
      { key: 'Sync', x: 320 },
    ];

    const it = legend.selectAll('g.item').data(items).enter().append('g').attr('class', 'item').attr('transform', (d) => `translate(${d.x},0)`);

    it.append('rect').attr('width', 12).attr('height', 12).attr('y', -10).attr('rx', 2).attr('fill', (d) => color(d.key)!);
    it.append('text').attr('x', 18).attr('y', 0).attr('alignment-baseline', 'middle').text((d) => d.key);
  }
}
