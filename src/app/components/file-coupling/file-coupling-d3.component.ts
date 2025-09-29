import {
  Component, Input, ElementRef, ViewChild, OnChanges, SimpleChanges, AfterViewInit, OnDestroy
} from '@angular/core';
import * as d3 from 'd3';

type FileCouplingEntry = { fanIn: string[]; fanOut: string[] };
type FileCouplingResult = Record<string, FileCouplingEntry>;
type FCMetric = { name: string; description: string; result: FileCouplingResult; status: boolean };

type NodeDatum = d3.SimulationNodeDatum & {
  id: string; name: string; degree: number;
};
type LinkDatum = d3.SimulationLinkDatum<NodeDatum> & {
  source: string | NodeDatum; target: string | NodeDatum;
};

@Component({
  selector: 'app-file-coupling-d3',
  standalone: true,
  template: `
  <div class="w-full">
    <div class="text-sm text-gray-600 mb-2">{{data?.name}} — {{data?.description}}</div>
    <div #host class="w-full h-[460px] border rounded-lg bg-white relative"></div>
  </div>
  `
})
export class FileCouplingD3Component implements AfterViewInit, OnChanges, OnDestroy {
  @Input() data!: FCMetric | null;
  @ViewChild('host', { static: true }) host!: ElementRef<HTMLDivElement>;

  private svg?: d3.Selection<SVGSVGElement, unknown, null, undefined>;
  private g?: d3.Selection<SVGGElement, unknown, null, undefined>;
  private linkSel?: d3.Selection<SVGLineElement, LinkDatum, SVGGElement, unknown>;
  private nodeSel?: d3.Selection<SVGCircleElement, NodeDatum, SVGGElement, unknown>;
  private labelSel?: d3.Selection<SVGTextElement, NodeDatum, SVGGElement, unknown>;
  private sim?: d3.Simulation<NodeDatum, LinkDatum>;
  private ro?: ResizeObserver;
  private tooltip?: d3.Selection<HTMLDivElement, unknown, null, undefined>;

  ngAfterViewInit() {
    this.initSvg();
    this.render();
    this.observeResize();
  }

  ngOnChanges(ch: SimpleChanges) {
    if (this.svg) this.render();
  }

  ngOnDestroy() {
    this.sim?.stop();
    this.ro?.disconnect();
  }

  private shorten(label: string): string {
    const parts = label.split('/');
    const file = parts.pop() || '';
    const folder = parts.pop() || '';
    return folder ? `${folder}/${file}` : file;
  }

  private buildGraph(fc: FileCouplingResult) {
    const files = Array.from(new Set(Object.keys(fc)));
    const nodes: NodeDatum[] = files.map(id => ({ id, name: this.shorten(id), degree: 0 }));
    const byId = new Map(nodes.map(n => [n.id, n]));
    const links: LinkDatum[] = [];

    for (const [src, { fanOut }] of Object.entries(fc)) {
      for (const dst of fanOut || []) {
        if (byId.has(dst)) {
          links.push({ source: src, target: dst });
          // contamos grado (no direccional para tamaño)
          byId.get(src)!.degree += 1;
          byId.get(dst)!.degree += 1;
        }
      }
    }
    return { nodes, links };
  }

  private initSvg() {
    const host = this.host.nativeElement;
    const { width, height } = host.getBoundingClientRect();

    this.svg = d3.select(host)
      .append('svg')
      .attr('width', width)
      .attr('height', height);

    // defs para flechas
    const defs = this.svg.append('defs');
    defs.append('marker')
      .attr('id', 'arrow')
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 14) // distancia desde el centro del nodo
      .attr('refY', 0)
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-5L10,0L0,5')
      .attr('fill', '#999')
      .attr('opacity', 0.8);

    // capa principal con zoom/pan
    this.g = this.svg.append('g');

    const zoomed = (event: d3.D3ZoomEvent<SVGSVGElement, unknown>) => {
      this.g!.attr('transform', event.transform.toString());
    };

    this.svg.call(d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.2, 4])
      .on('zoom', zoomed as any));

    // tooltip
    this.tooltip = d3.select(this.host.nativeElement)
      .append('div')
      .style('position', 'absolute')
      .style('pointer-events', 'none')
      .style('background', 'rgba(0,0,0,0.75)')
      .style('color', '#fff')
      .style('padding', '6px 8px')
      .style('font-size', '12px')
      .style('border-radius', '6px')
      .style('opacity', 0);
  }

  private render() {
    if (!this.data?.result || !this.svg || !this.g) return;
    const { width, height } = this.host.nativeElement.getBoundingClientRect();
    this.svg.attr('width', width).attr('height', height);

    // limpiar capa
    this.g.selectAll('*').remove();

    const { nodes, links } = this.buildGraph(this.data.result);

    // escalas (tamaño de nodo por grado)
    const degs = nodes.map(n => n.degree);
    const size = d3.scaleSqrt()
      .domain([d3.min(degs) ?? 0, d3.max(degs) ?? 1])
      .range([6, 18]);

    // links
    this.linkSel = this.g.append('g')
      .attr('stroke', '#999')
      .attr('stroke-opacity', 0.6)
      .selectAll<SVGLineElement, LinkDatum>('line')
      .data(links)
      .join('line')
      .attr('stroke-width', 1)
      .attr('marker-end', 'url(#arrow)');

    // nodes
    this.nodeSel = this.g.append('g')
      .selectAll<SVGCircleElement, NodeDatum>('circle')
      .data(nodes)
      .join('circle')
      .attr('r', d => size(d.degree))
      .attr('fill', '#4f46e5')
      .attr('fill-opacity', 0.9)
      .attr('stroke', '#fff')
      .attr('stroke-width', 1)
      .call(d3.drag<SVGCircleElement, NodeDatum>()
        .on('start', (event, d) => {
          if (!event.active) this.sim?.alphaTarget(0.3).restart();
          d.fx = d.x; d.fy = d.y;
        })
        .on('drag', (event, d) => {
          d.fx = event.x; d.fy = event.y;
        })
        .on('end', (_event, d) => {
          this.sim?.alphaTarget(0);
          d.fx = null; d.fy = null;
        })
      )
      .on('mouseover', (_event, d) => {
        this.tooltip!
          .style('opacity', 1)
          .html(`<strong>${d.name}</strong><br>grado: ${d.degree}`);
      })
      .on('mousemove', (event) => {
        this.tooltip!
          .style('left', event.offsetX + 12 + 'px')
          .style('top', event.offsetY + 12 + 'px');
      })
      .on('mouseout', () => {
        this.tooltip!.style('opacity', 0);
      });

    // labels
    this.labelSel = this.g.append('g')
      .selectAll<SVGTextElement, NodeDatum>('text')
      .data(nodes)
      .join('text')
      .text(d => d.name)
      .attr('font-size', 11)
      .attr('dx', 10)
      .attr('dy', 4)
      .attr('fill', '#334155');

    // simulación
    this.sim?.stop();
    this.sim = d3.forceSimulation<NodeDatum>(nodes)
      .force('link', d3.forceLink<NodeDatum, LinkDatum>(links)
        .id(d => d.id)
        .distance(80)
        .strength(0.6)
      )
      .force('charge', d3.forceManyBody().strength(-180))
      .force('collide', d3.forceCollide<NodeDatum>().radius(d => size(d.degree) + 6))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .on('tick', () => {
        this.linkSel!
          .attr('x1', d => (d.source as NodeDatum).x!)
          .attr('y1', d => (d.source as NodeDatum).y!)
          .attr('x2', d => (d.target as NodeDatum).x!)
          .attr('y2', d => (d.target as NodeDatum).y!);

        this.nodeSel!
          .attr('cx', d => d.x!)
          .attr('cy', d => d.y!);

        this.labelSel!
          .attr('x', d => d.x!)
          .attr('y', d => d.y!);
      });
  }

  private observeResize() {
    this.ro = new ResizeObserver(() => this.render());
    this.ro.observe(this.host.nativeElement);
  }
}
