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

type BarDatum = { name: string; value: number };

@Component({
  selector: 'app-functions-bar-chart',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './functions-bar-chart.component.html',
  styleUrls: ['./functions-bar-chart.component.css'],
})
export class FunctionsBarChartComponent implements AfterViewInit, OnChanges {
  private destroyRef = inject(DestroyRef);

  /**
   * Opción A: pásame directamente los datos agregados
   * ej: [{ name: 'Declaration', value: 120 }, ...]
   */
  @Input() data?: BarDatum[];

  /**
   * Opción B: pásame el result crudo de la métrica para que yo agregue.
   * Si vienen ambos, se prioriza `data`.
   */
  @Input() rawResult?: RawResult;

  /** Título opcional que se mostrará arriba del gráfico */
  @Input() title = 'Tipos de función en el repositorio';

  /** Margenes del gráfico */
  @Input() margin = { top: 30, right: 16, bottom: 40, left: 56 };

  @ViewChild('host', { static: true }) hostRef!: ElementRef<HTMLDivElement>;

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
    // si cambia input (data o rawResult) y ya existe el SVG, re-renderizar
    if (this.svg) this.render();
  }

  private setupResizeObserver() {
    this.resizeObs = new ResizeObserver(() => this.render());
    this.resizeObs.observe(this.hostRef.nativeElement);
    this.destroyRef.onDestroy(() => {
      this.resizeObs?.disconnect();
    });
  }

  private createBase() {
    const host = this.hostRef.nativeElement;
    d3.select(host).selectAll('svg').remove();
    d3.select(host).selectAll('.tooltip').remove();

    this.svg = d3.select(host).append('svg').attr('class', 'chart-svg');
    this.g = this.svg.append('g').attr('class', 'chart-inner');

    this.tooltip = d3
      .select(host)
      .append('div')
      .attr('class', 'tooltip')
      .style('opacity', 0);
  }

  private getAggregatedData(): BarDatum[] {
    if (this.data && this.data.length) return this.data;

    const result = this.rawResult || {};
    let decl = 0;
    let expr = 0;
    let arrow = 0;

    for (const file of Object.keys(result)) {
      const fns = result[file] ?? {};
      for (const fname of Object.keys(fns)) {
        const node = fns[fname] ?? {};
        const t = (node.type ?? '').toLowerCase();
        if (t.includes('arrow')) arrow++;
        else if (t.includes('declaration')) decl++;
        else if (t.includes('expression')) expr++;
      }
    }

    return [
      { name: 'Declaration', value: decl },
      { name: 'Expression', value: expr },
      { name: 'Arrow', value: arrow },
    ];
  }

  private render() {
    if (!this.svg || !this.g) return;

    const host = this.hostRef.nativeElement;
    const { width: hostW } = host.getBoundingClientRect();
    const width = Math.max(320, hostW);
    const height = 280;

    const { top, right, bottom, left } = this.margin;

    this.svg.attr('width', width).attr('height', height);
    this.g.attr('transform', `translate(${left},${top})`);

    const w = width - left - right;
    const h = height - top - bottom;

    const data = this.getAggregatedData();

    // escalas
    const x = d3
      .scaleBand<string>()
      .domain(data.map((d) => d.name))
      .range([0, w])
      .padding(0.2);

    const maxV = d3.max(data, (d) => d.value) ?? 0;
    const y = d3.scaleLinear().domain([0, Math.max(1, maxV)]).range([h, 0]).nice();

    // ejes
    this.g.selectAll('.axis').remove();
    this.g
      .append('g')
      .attr('class', 'axis axis-x')
      .attr('transform', `translate(0,${h})`)
      .call(d3.axisBottom(x));

    this.g
      .append('g')
      .attr('class', 'axis axis-y')
      .call(d3.axisLeft(y).ticks(5).tickFormat(d3.format('d') as any));

    // titulo
    this.g.selectAll('.title').remove();
    this.g
      .append('text')
      .attr('class', 'title')
      .attr('x', 0)
      .attr('y', -8)
      .text(this.title);

    // barras
    const bars = this.g.selectAll<SVGRectElement, BarDatum>('.bar').data(data, (d: any) => d.name);

    bars.exit().remove();

    const t = this.svg.transition().duration(350);

    bars
      .transition(t as any)
      .attr('x', (d) => x(d.name)!)
      .attr('y', (d) => y(d.value))
      .attr('width', x.bandwidth())
      .attr('height', (d) => h - y(d.value));

    bars
      .enter()
      .append('rect')
      .attr('class', 'bar')
      .attr('rx', 6)
      .attr('ry', 6)
      .attr('x', (d) => x(d.name)!)
      .attr('y', h)
      .attr('width', x.bandwidth())
      .attr('height', 0)
      .on('mousemove', (event, d) => this.showTooltip(event, d))
      .on('mouseleave', () => this.hideTooltip())
      .transition(t as any)
      .attr('y', (d) => y(d.value))
      .attr('height', (d) => h - y(d.value));

    // labels numéricos en las barras
    const labels = this.g.selectAll<SVGTextElement, BarDatum>('.bar-label').data(data, (d: any) => d.name);
    labels.exit().remove();

    labels
      .transition(t as any)
      .attr('x', (d) => (x(d.name)! + x.bandwidth() / 2))
      .attr('y', (d) => y(d.value) - 6)
      .text((d) => d.value.toString());

    labels
      .enter()
      .append('text')
      .attr('class', 'bar-label')
      .attr('text-anchor', 'middle')
      .attr('x', (d) => (x(d.name)! + x.bandwidth() / 2))
      .attr('y', h - 6)
      .text((d) => d.value.toString())
      .transition(t as any)
      .attr('y', (d) => y(d.value) - 6);
  }

  private showTooltip(event: MouseEvent, d: BarDatum) {
    if (!this.tooltip) return;
    const [px, py] = d3.pointer(event, this.hostRef.nativeElement);
    this.tooltip
      .style('opacity', 1)
      .style('left', `${px + 10}px`)
      .style('top', `${py - 10}px`)
      .html(`
        <div class="tt-name">${d.name}</div>
        <div class="tt-val"><strong>${d.value}</strong> funciones</div>
      `);
  }

  private hideTooltip() {
    this.tooltip?.style('opacity', 0);
  }
}
