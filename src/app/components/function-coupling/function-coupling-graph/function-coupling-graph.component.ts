import {
  Component,
  Input,
  ElementRef,
  ViewChild,
  OnChanges,
  SimpleChanges,
  AfterViewInit,
  OnDestroy,
  signal,
  computed,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import * as d3 from 'd3';

type CouplingNode = d3.SimulationNodeDatum & {
  id: string;      // file::func
  file: string;
  func: string;
  fanIn: number;
  fanOut: number;
  total: number;
};


type CouplingLink = {
  source: string;       // id
  target: string;       // id
  value: number;        // calls count
};

export type FunctionCouplingResult = {
  [filePath: string]: {
    [funcName: string]: {
      type: string;
      ['fan-out']?: Record<string, number>;
      ['fan-in']?: Record<string, number>;
    };
  };
};

@Component({
  selector: 'function-coupling-graph',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './function-coupling-graph.component.html',
})
export class FunctionCouplingGraphComponent implements OnChanges, AfterViewInit, OnDestroy {
  @Input({ required: true }) result!: FunctionCouplingResult; // del servicio getMetrics
  /** Máximo de nodos cuando no hay foco (overview) */
  @Input() maxOverviewNodes = 200;

  /** Modo de exploración */
  mode = signal<'fan-out' | 'fan-in'>('fan-out');

  /** Búsqueda rápida por nombre de función (contiene, case-insensitive) */
  query = signal<string>('');

  /** Nodo seleccionado (id = file::func); null -> overview */
  selectedId = signal<string | null>(null);

  /** Índices para búsquedas rápidas */
  private idToNode = new Map<string, CouplingNode>();
  private nameToIds = new Map<string, string[]>(); // funcName -> [ids con ese nombre]
  private linksAll: CouplingLink[] = [];
  private nodesAll: CouplingNode[] = [];

  /** Vista filtrada para render según estado */
  private nodesView: CouplingNode[] = [];
  private linksView: CouplingLink[] = [];

  /** D3 */
  @ViewChild('container', { static: true }) container!: ElementRef<HTMLDivElement>;
  private svg?: d3.Selection<SVGSVGElement, unknown, null, undefined>;
  private gZoom?: d3.Selection<SVGGElement, unknown, null, undefined>;
  private sim?: d3.Simulation<CouplingNode, CouplingLink>;
  private gLinks?: d3.Selection<SVGLineElement, CouplingLink, SVGGElement, unknown>;
  private gNodes?: d3.Selection<SVGCircleElement, CouplingNode, SVGGElement, unknown>;
  private gLabels?: d3.Selection<SVGTextElement, CouplingNode, SVGGElement, unknown>;
  private resizeObserver?: ResizeObserver;

  // escalas
  private rScale = d3.scaleSqrt().range([4, 28]);
  private wScale = d3.scaleLog().range([0.5, 6]).clamp(true);
  private color = d3.scaleOrdinal<string, string>(d3.schemeTableau10);

  ngAfterViewInit(): void {
    this.initSvg();
    this.observeResize();
    this.rebuildFromInput();
  }

  ngOnChanges(ch: SimpleChanges): void {
    if (ch['result'] && this.container) {
      this.rebuildFromInput();
    }
  }

  ngOnDestroy(): void {
    this.sim?.stop();
    this.resizeObserver?.disconnect();
  }

  // ───────────────────────── UI actions ─────────────────────────
  setMode(m: 'fan-out' | 'fan-in') {
    if (this.mode() !== m) {
      this.mode.set(m);
      this.updateView();
    }
  }

  onSearch(q: string) {
    this.query.set(q);
    // si hay búsqueda, limpiamos selección para overview filtrado
    this.selectedId.set(null);
    this.updateView();
  }

  resetView() {
    this.selectedId.set(null);
    this.query.set('');
    this.updateView();
    this.zoomToFit();
  }

  // ───────────────────────── Build data ─────────────────────────
  private rebuildFromInput() {
    this.sim?.stop();
    this.idToNode.clear();
    this.nameToIds.clear();
    this.nodesAll = [];
    this.linksAll = [];

    if (!this.result || !Object.keys(this.result).length) {
      this.updateView(); // limpia
      return;
    }

    // 1) crear nodos básicos
    for (const [file, funcs] of Object.entries(this.result)) {
      for (const [func, info] of Object.entries(funcs)) {
const fanOut = sumValues(info['fan-out'] ?? {});
const fanIn  = sumValues(info['fan-in'] ?? {});
        const node: CouplingNode = {
          id: `${file}::${func}`,
          file,
          func,
          fanIn,
          fanOut,
          total: fanIn + fanOut,
        };
        this.nodesAll.push(node);
        this.idToNode.set(node.id, node);
        // índice por nombre de función
        const arr = this.nameToIds.get(func) ?? [];
        arr.push(node.id);
        this.nameToIds.set(func, arr);
      }
    }

    // 2) crear links (caller -> callee) desde fan-out
    for (const [file, funcs] of Object.entries(this.result)) {
      for (const [func, info] of Object.entries(funcs)) {
        const sourceId = `${file}::${func}`;
        for (const [calleeName, times] of Object.entries(info['fan-out'] ?? {})) {
          // si hay múltiples funciones con el mismo nombre en el repo, enlazamos a todas
          const targetIds = this.nameToIds.get(calleeName);
          if (!targetIds) continue;
          for (const tgt of targetIds) {
            this.linksAll.push({ source: sourceId, target: tgt, value: times });
          }
        }
      }
    }

    // 3) set escalas
    const maxTotal = d3.max(this.nodesAll, d => d.total) ?? 1;
    const maxWeight = d3.max(this.linksAll, d => d.value) ?? 1;
    this.rScale.domain([1, Math.max(2, maxTotal)]);
    this.wScale.domain([1, Math.max(2, maxWeight)]);

    // vista inicial
    this.selectedId.set(null);
    this.updateView(true);
    this.zoomToFit();
  }

  // ──────────────────────── Compute view ────────────────────────
  private updateView(recenter = false) {
    // overview filtrado por query y top N
    if (!this.selectedId()) {
      let nodes = this.nodesAll;
      const q = this.query().trim().toLowerCase();
      if (q) {
        nodes = nodes.filter(n => n.func.toLowerCase().includes(q) || n.file.toLowerCase().includes(q));
      }
      nodes = nodes
        .sort((a, b) => b.total - a.total)
        .slice(0, this.maxOverviewNodes);

      const idset = new Set(nodes.map(n => n.id));
      const links = this.linksAll.filter(l => idset.has(l.source) && idset.has(l.target));

      this.nodesView = nodes;
      this.linksView = links;
    } else {
      // ego-network según modo
      const centerId = this.selectedId()!;
      const mode = this.mode();
      const neighbors = new Set<string>([centerId]);

      let links: CouplingLink[];
      if (mode === 'fan-out') {
        links = this.linksAll.filter(l => l.source === centerId);
        links.forEach(l => neighbors.add(l.target));
      } else {
        links = this.linksAll.filter(l => l.target === centerId);
        links.forEach(l => neighbors.add(l.source));
      }

      this.nodesView = Array.from(neighbors).map(id => this.idToNode.get(id)!).filter(Boolean);
      this.linksView = links;
    }

    this.render(recenter);
  }

  // ─────────────────────────── Render ───────────────────────────
  private initSvg() {
    const el = this.container.nativeElement;
    const w = el.clientWidth || 800;
    const h = Math.max(420, Math.round(w * 0.6));

    this.svg = d3.select(el)
      .append('svg')
      .attr('width', w)
      .attr('height', h)
      .attr('class', 'block');

    this.gZoom = this.svg.append('g');

    this.gLinks = this.gZoom.append('g')
      .attr('stroke', 'currentColor')
      .attr('stroke-opacity', 0.45)
      .selectAll<SVGLineElement, CouplingLink>('line');

    this.gNodes = this.gZoom.append('g')
      .selectAll<SVGCircleElement, CouplingNode>('circle');

    this.gLabels = this.gZoom.append('g')
      .selectAll<SVGTextElement, CouplingNode>('text');

    // zoom/pan
    this.svg.call(
      d3.zoom<SVGSVGElement, unknown>()
        .scaleExtent([0.25, 4])
        .on('zoom', (ev) => this.gZoom!.attr('transform', String(ev.transform)))
    );
  }

  private render(recenter = false) {
    if (!this.svg || !this.gZoom) return;

    // DATA JOIN
    this.gLinks = this.gLinks!.data(this.linksView, (d: any) => `${d.source}->${d.target}`);
    this.gLinks.exit().remove();
    const linksEnter = this.gLinks.enter().append('line')
      .attr('stroke-width', d => this.wScale(d.value));
    this.gLinks = linksEnter.merge(this.gLinks);

    this.gNodes = this.gNodes!.data(this.nodesView, (d: any) => d.id);
    this.gNodes.exit().remove();
// enter: círculos
const nodesEnter = this.gNodes.enter()
  .append('circle')
  .attr('r', d => this.rScale(Math.max(1, d.total)))
  .attr('fill', d => this.color(d.file))
  .attr('stroke', 'white')
  .attr('stroke-width', 1.2)
  .style('cursor', 'pointer')
  .on('click', (_ev, d) => {
    const cur = this.selectedId();
    this.selectedId.set(cur === d.id ? null : d.id);
    this.updateView(true);
  });

// importante: agregar <title> en una llamada separada
nodesEnter
  .append<SVGTitleElement>('title')
  .text(d =>
    `${d.func}\n${d.file}\nfan-out: ${d.fanOut}\nfan-in: ${d.fanIn}\ntotal: ${d.total}`
  );

// ahora sí, merge de círculos con círculos
this.gNodes = nodesEnter.merge(this.gNodes);


    this.gLabels = this.gLabels!.data(this.nodesView, (d: any) => d.id);
    this.gLabels.exit().remove();
    const labelsEnter = this.gLabels.enter().append('text')
      .attr('font-size', 11)
      .attr('stroke', 'white')
      .attr('paint-order', 'stroke')
      .attr('stroke-width', 3)
      .attr('dy', '-0.9em')
      .attr('text-anchor', 'middle')
      .text(d => d.func);
    this.gLabels = labelsEnter.merge(this.gLabels);

    // SIM
    const el = this.container.nativeElement;
    const w = el.clientWidth || 800;
    const h = Math.max(420, Math.round(w * 0.6));
    this.svg.attr('width', w).attr('height', h);

    this.sim?.stop();
    this.sim = d3.forceSimulation<CouplingNode>(this.nodesView)
      .force('link', d3.forceLink<CouplingNode, CouplingLink>(this.linksView)
        .id(d => d.id)
        .distance(l => 80 + 10 * Math.log(1 + (1 / Math.max(1, l.value))))
        .strength(l => 0.3 + 0.15 * Math.log(1 + l.value))
      )
      .force('charge', d3.forceManyBody<CouplingNode>().strength(d => -40 - d.total * 2))
      .force('center', d3.forceCenter(w / 2, h / 2))
      .force('collision', d3.forceCollide<CouplingNode>().radius(d => this.rScale(Math.max(1, d.total)) + 6))
      .on('tick', () => {
        this.gLinks!
          .attr('x1', (d: any) => (d.source.x))
          .attr('y1', (d: any) => (d.source.y))
          .attr('x2', (d: any) => (d.target.x))
          .attr('y2', (d: any) => (d.target.y));

        this.gNodes!
          .attr('cx', (d: any) => d.x)
          .attr('cy', (d: any) => d.y);

        this.gLabels!
          .attr('x', (d: any) => d.x)
          .attr('y', (d: any) => d.y);
      });

    // resaltar centro
    const centerId = this.selectedId();
    this.gNodes.attr('opacity', (d) => {
      if (!centerId) return 0.95;
      if (d.id === centerId) return 1;
      // en ego-network sólo hay los vecinos; igual destacamos el centro
      return 0.95;
    });

    // grosor ya codifica valor; cambiamos opacidad por modo para enfatizar dirección
    const mode = this.mode();
    this.gLinks.attr('marker-end', null).attr('opacity', 0.6);
    // opcional: triángulos para dirección
    this.svg.selectAll('defs').remove();
    const defs = this.svg.append('defs');
    defs.append('marker')
      .attr('id', 'arrow')
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 12)
      .attr('refY', 0)
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-5L10,0L0,5')
      .attr('fill', 'currentColor');

    this.gLinks.attr('marker-end', 'url(#arrow)');

    if (recenter) this.zoomToFit();
  }

  private zoomToFit() {
    if (!this.svg || !this.gZoom) return;
    const svg = this.svg;
    const g = this.gZoom;
    const svgEl = (svg.node() as SVGSVGElement);
    const bbox = g.node()!.getBBox();
    const width = svgEl.clientWidth || 800;
    const height = svgEl.clientHeight || 600;

    if (!isFinite(bbox.x) || !isFinite(bbox.width)) return;

    const scale = 0.9 / Math.max(bbox.width / width, bbox.height / height, 0.0001);
    const tx = (width - scale * (bbox.x + bbox.width / 2)) / 2;
    const ty = (height - scale * (bbox.y + bbox.height / 2)) / 2;

    svg.transition().duration(450).call(
      (d3.zoom() as any).transform,
      d3.zoomIdentity.translate(tx, ty).scale(scale)
    );
  }

  private observeResize() {
    this.resizeObserver = new ResizeObserver(() => {
      this.updateView(true);
    });
    this.resizeObserver.observe(this.container.nativeElement);
  }

  // ────────────────────────── Helpers ───────────────────────────
  selectFirstMatch() {
    const q = this.query().trim().toLowerCase();
    if (!q) return;
    const first = this.nodesAll.find(n => n.func.toLowerCase().includes(q) || n.file.toLowerCase().includes(q));
    if (first) {
      this.selectedId.set(first.id);
      this.updateView(true);
    }
  }
}

function sumValues(obj: Record<string, number>): number {
  let s = 0;
  for (const v of Object.values(obj)) s += v || 0;
  return s;
}
