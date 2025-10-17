// ===============================
// file: src/app/components/function-coupling/function-coupling-graph.component.ts
// ===============================
import { Component, OnInit, ElementRef, Input, inject, OnDestroy, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Chart, registerables } from 'chart.js';
import * as d3 from 'd3';
import { MetricsService } from '../../../services/metrics.service';
Chart.register(...registerables);

interface NodeData {
  id: string;              // unique id => `${file}::${fn}`
  label: string;           // human label => function name
  file: string;            // file path
  fanIn: number;
  fanOut: number;
  x?: number; y?: number; fx?: number | null; fy?: number | null;
}

interface LinkData {
  source: string | NodeData;
  target: string | NodeData;
  value: number; // intensity (calls count)
}

interface FunctionEntry {
  type: string;
  ['fan-out']?: Record<string, number>; // callee -> count
  ['fan-in']?: Record<string, number>;  // caller -> count
}

interface FunctionCouplingResult {
  name: string;
  description: string;
  result: Record<string, Record<string, FunctionEntry>>; // file -> fn -> data
  status: boolean;
}

@Component({
  selector: 'app-function-coupling-graph',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './function-coupling-graph.component.html',
  styleUrls: ['./function-coupling-graph.component.css']
})
export class FunctionCouplingGraphComponent implements OnInit, OnDestroy {
  private metricsService = inject(MetricsService);
  private el = inject(ElementRef);

  @Input({ required: true }) repoId!: string;

  loading = signal(false);
  error = signal<string | null>(null);
  currentPage = signal(0);

  private chart: Chart | null = null;
  private simulation: d3.Simulation<NodeData, LinkData> | null = null;
  private allNodes: NodeData[] = [];
  private allLinks: LinkData[] = [];

  selected = signal<NodeData | null>(null);
  neighbors = signal<{ callers: string[]; callees: string[] }>({ callers: [], callees: [] });
  hasSelection = computed(() => this.selected() !== null);

  ngOnInit(): void {
    this.loadData();
  }

  ngOnDestroy() {
    if (this.chart) this.chart.destroy();
    if (this.simulation) this.simulation.stop();
  }

  private loadData() {
    this.loading.set(true);
    this.error.set(null);

    this.metricsService.getMetric(this.repoId, "function-coupling").subscribe({
      next: (data: FunctionCouplingResult | any) => {
        if (data?.result) {
          this.processData(data.result);
          this.loading.set(false);
        } else {
          this.error.set('No data received');
          this.loading.set(false);
        }
      },
      error: (err: unknown) => {
        const message = err instanceof Error ? err.message : 'Error al cargar el acoplamiento de funciones';
        this.error.set(message);
        this.loading.set(false);
      }
    });
  }

  // ————————————————————————————————————————————————
  // Data shaping
  // ————————————————————————————————————————————————
  private processData(result: Record<string, Record<string, FunctionEntry>>) {
    const nodesMap = new Map<string, NodeData>();
    const links: LinkData[] = [];

    const key = (file: string, fn: string) => `${file}::${fn}`;

    // First pass: ensure nodes exist and accumulate fanIn/out
    for (const file of Object.keys(result)) {
      for (const fnName of Object.keys(result[file])) {
        const fnData = result[file][fnName];
        const id = key(file, fnName);
        if (!nodesMap.has(id)) nodesMap.set(id, { id, label: fnName, file, fanIn: 0, fanOut: 0 });

        // accumulate from fan-out
        const fanOut = fnData['fan-out'] || {};
        for (const callee of Object.keys(fanOut)) {
          // callee could be unqualified (name only). Try to resolve across files
          // naive approach: search same-name across all files; if multiple, keep name-only id to create a node anyway.
          const targetId = this.resolveFunctionId(result, callee) || key(file, callee);
          if (!nodesMap.has(targetId)) {
            const [tFile, tFn] = targetId.includes('::') ? targetId.split('::') : [file, callee];
            nodesMap.set(targetId, { id: targetId, label: tFn, file: tFile, fanIn: 0, fanOut: 0 });
          }
          const intensity = fanOut[callee] ?? 1;
          nodesMap.get(id)!.fanOut += intensity;
          nodesMap.get(targetId)!.fanIn += intensity;
          links.push({ source: id, target: targetId, value: intensity });
        }
      }
    }

    this.allNodes = Array.from(nodesMap.values());
    this.allLinks = links;
    this.currentPage.set(0);

    this.renderForceGraph(this.allNodes, this.allLinks);
    this.renderBarChart(this.allNodes);
  }

  /** Try to resolve an unqualified function name to a `${file}::${fn}` id. */
  private resolveFunctionId(result: Record<string, Record<string, FunctionEntry>>, fnName: string): string | null {
    const files = Object.keys(result).filter(f => Object.prototype.hasOwnProperty.call(result[f], fnName));
    if (files.length === 1) return `${files[0]}::${fnName}`;
    return null; // ambiguous, let caller create fallback id
  }

  // ————————————————————————————————————————————————
  // D3 force graph + Expand-on-click interaction
  // ————————————————————————————————————————————————
  private renderForceGraph(nodes: NodeData[], links: LinkData[]) {
    const element = this.el.nativeElement.querySelector('#d3FunctionGraph');
    if (!element) return;

    element.innerHTML = '';

    const width = element.clientWidth || 800;
    const height = 500;

    const svg = d3.select(element)
      .append('svg')
      .attr('width', '100%')
      .attr('height', height)
      .style('border', '1px solid #ccc')
      .style('background', '#fafafa');

    const g = svg.append('g');

    this.simulation = d3.forceSimulation(nodes)
      .force('link', d3.forceLink<NodeData, LinkData>(links).id((d: NodeData) => d.id).distance(160).strength(0.6))
      .force('charge', d3.forceManyBody<NodeData>().strength(-420))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collide', d3.forceCollide<NodeData>().radius(d => 28 + Math.sqrt(d.fanIn + d.fanOut)).strength(0.8));

    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .on('zoom', (event: d3.D3ZoomEvent<SVGSVGElement, unknown>) => g.attr('transform', event.transform.toString()));
    svg.call(zoom as any);

    // arrowhead
    svg.append('defs')
      .append('marker')
      .attr('id', 'arrowhead')
      .attr('markerWidth', 10).attr('markerHeight', 10)
      .attr('refX', 18).attr('refY', 3).attr('orient', 'auto')
      .append('polygon').attr('points', '0 0, 10 3, 0 6').attr('fill', '#9aa0a6');

    // Links
    const link = (g.append('g').attr('class', 'links')
      .selectAll<SVGLineElement, LinkData>('line')
      .data(links)
      .join('line')
      .attr('stroke', '#9aa0a6')
      .attr('stroke-opacity', 0.6)
      .attr('stroke-width', d => Math.max(1, Math.sqrt(d.value)))
      .attr('marker-end', 'url(#arrowhead)')) as unknown as d3.Selection<SVGLineElement, LinkData, SVGGElement, unknown>;

    // Nodes
    const node = g.append('g').attr('class', 'nodes')
      .selectAll<SVGCircleElement, NodeData>('circle')
      .data(nodes)
      .join('circle')
      .attr('r', (d) => 22 + Math.sqrt(d.fanIn + d.fanOut))
      .attr('fill', (d) => {
        const total = d.fanIn + d.fanOut;
        if (total > 30) return '#d32f2f';
        if (total > 15) return '#ff6f00';
        return '#669933';
      })
      .attr('stroke', '#2f2f2f')
      .attr('stroke-width', 1.25)
      .style('cursor', 'pointer')
      .on('click', (_evt, d) => this.expandNode(d, svg, node, link))
      .on('mouseenter', function (_evt: MouseEvent, d: NodeData) {
        const connected = new Set<string>([d.id]);
        links.forEach(l => {
          const s = typeof l.source === 'string' ? l.source : l.source.id;
          const t = typeof l.target === 'string' ? l.target : l.target.id;
          if (s === d.id) connected.add(t);
          if (t === d.id) connected.add(s);
        });
        node.attr('opacity', nd => connected.has(nd.id) ? 1 : 0.15);
        link.attr('opacity', l => {
          const s = typeof l.source === 'string' ? l.source : l.source.id;
          const t = typeof l.target === 'string' ? l.target : l.target.id;
          return (s === d.id || t === d.id) ? 1 : 0.05;
        });
        label.attr('opacity', nd => connected.has(nd.id) ? 1 : 0.15);
      })
      .on('mouseleave', function () {
        node.attr('opacity', 1); link.attr('opacity', 0.6); label.attr('opacity', 1);
      })
      .call(
        d3.drag<SVGCircleElement, NodeData>()
          .on('start', (event) => this.dragStarted(event, this.simulation!))
          .on('drag', (event) => this.dragged(event))
          .on('end', (event) => this.dragEnded(event, this.simulation!))
      );

    // Labels
    const label = g.append('g').attr('class', 'labels')
      .selectAll<SVGTextElement, NodeData>('text')
      .data(nodes)
      .join('text')
      .text(d => d.label)
      .attr('font-size', 14)
      .attr('text-anchor', 'middle')
      .attr('dy', '.35em')
      .attr('fill', '#2f2f2f')
      .attr('pointer-events', 'none')
      .style('font-weight', '600');

    node.append('title').text(d => `${d.label}\nFile: ${d.file}\nFan-In: ${d.fanIn}\nFan-Out: ${d.fanOut}`);

    this.simulation.on('tick', () => {
      link
        .attr('x1', d => (d.source as NodeData).x || 0)
        .attr('y1', d => (d.source as NodeData).y || 0)
        .attr('x2', d => (d.target as NodeData).x || 0)
        .attr('y2', d => (d.target as NodeData).y || 0);
      node
        .attr('cx', d => d.x || 0)
        .attr('cy', d => d.y || 0);
      label
        .attr('x', d => d.x || 0)
        .attr('y', d => d.y || 0);
    });

    // Reset zoom helper
    svg.append('text')
      .attr('x', 10).attr('y', 24)
      .attr('font-size', 12).attr('fill', '#666')
      .style('cursor', 'pointer')
      .text('Doble click para reset zoom')
      .on('dblclick', () => svg.transition().duration(750).call(zoom.transform as any, d3.zoomIdentity.translate(0, 0)));

    svg.on('dblclick.zoom', () => svg.transition().duration(750).call(zoom.transform as any, d3.zoomIdentity.translate(0, 0)));
  }

  // Expand node: focus neighborhood + show details panel
  private expandNode(d: NodeData, svg: d3.Selection<SVGSVGElement, unknown, null, undefined>, nodeSel: d3.Selection<SVGCircleElement, NodeData, SVGGElement, unknown>, linkSel: d3.Selection<SVGLineElement, LinkData, SVGGElement, unknown>) {
    this.selected.set(d);

    const callers = new Set<string>();
    const callees = new Set<string>();

    this.allLinks.forEach(l => {
      const s = typeof l.source === 'string' ? l.source : l.source.id;
      const t = typeof l.target === 'string' ? l.target : l.target.id;
      if (t === d.id) callers.add(s);
      if (s === d.id) callees.add(t);
    });

    this.neighbors.set({ callers: Array.from(callers), callees: Array.from(callees) });

    const hood = new Set<string>([d.id, ...callers, ...callees]);
    nodeSel.attr('opacity', nd => hood.has(nd.id) ? 1 : 0.08);
    linkSel.attr('opacity', l => {
      const s = typeof l.source === 'string' ? l.source : (l.source as NodeData).id;
      const t = typeof l.target === 'string' ? l.target : (l.target as NodeData).id;
      return (s === d.id || t === d.id) ? 1 : (hood.has(s) && hood.has(t) ? 0.35 : 0.04);
    });

    // Zoom to selection
    const target = d3.select<SVGCircleElement, NodeData>(nodeSel.filter(nd => nd.id === d.id).node() as any);
    const cx = d.x ?? 0, cy = d.y ?? 0;
    svg.transition().duration(500).call((d3.zoom().scaleTo as any), 1.4, [cx, cy]);
  }

  private dragStarted(event: d3.D3DragEvent<SVGCircleElement, NodeData, NodeData>, simulation: d3.Simulation<NodeData, LinkData>) {
    if (!event.active) simulation.alphaTarget(0.3).restart();
    event.subject.fx = event.subject.x; event.subject.fy = event.subject.y;
  }
  private dragged(event: d3.D3DragEvent<SVGCircleElement, NodeData, NodeData>) {
    event.subject.fx = event.x; event.subject.fy = event.y;
  }
  private dragEnded(event: d3.D3DragEvent<SVGCircleElement, NodeData, NodeData>, simulation: d3.Simulation<NodeData, LinkData>) {
    if (!event.active) simulation.alphaTarget(0);
    event.subject.fx = null; event.subject.fy = null;
  }

  // ————————————————————————————————————————————————
  // Bar chart (unchanged UX)
  // ————————————————————————————————————————————————
  renderBarChart(nodes: NodeData[]) {
    const ctx = this.el.nativeElement.querySelector('#functionCouplingBarChart');
    if (!ctx) return;
    if (this.chart) this.chart.destroy();

    const itemsPerPage = 10;
    const sorted = [...nodes].sort((a, b) => (b.fanIn + b.fanOut) - (a.fanIn + a.fanOut));
    const startIdx = this.currentPage() * itemsPerPage;
    const endIdx = startIdx + itemsPerPage;
    const pageNodes = sorted.slice(startIdx, endIdx);

    const labels = pageNodes.map(n => n.label);
    const fanIn = pageNodes.map(n => n.fanIn);
    const fanOut = pageNodes.map(n => n.fanOut);
    const totalPages = Math.ceil(sorted.length / itemsPerPage) || 1;

    this.chart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'Fan-In', data: fanIn, backgroundColor: '#2196F3', borderColor: '#1976D2', borderWidth: 1 },
          { label: 'Fan-Out', data: fanOut, backgroundColor: '#FF9800', borderColor: '#F57C00', borderWidth: 1 }
        ]
      },
      options: {
        plugins: {
          title: { display: true, text: `Function Coupling (Fan-In vs Fan-Out) - Page ${this.currentPage() + 1} of ${totalPages}`, font: { size: 14, weight: 'bold' } },
          legend: { position: 'top' }
        },
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: 'y',
        scales: { x: { beginAtZero: true, stacked: false } }
      }
    });
  }

  nextPage() {
    const itemsPerPage = 10;
    const totalPages = Math.ceil(this.allNodes.length / itemsPerPage) || 1;
    if (this.currentPage() < totalPages - 1) {
      this.currentPage.update(p => p + 1);
      this.renderBarChart(this.allNodes);
    }
  }
  previousPage() {
    if (this.currentPage() > 0) {
      this.currentPage.update(p => p - 1);
      this.renderBarChart(this.allNodes);
    }
  }

  // Helpers for template
  clearSelection() {
    this.selected.set(null);
    const element = this.el.nativeElement.querySelector('#d3FunctionGraph svg');
    if (!element) return;
    const svg = d3.select<SVGSVGElement, unknown>(element);
    svg.selectAll('.nodes circle').attr('opacity', 1);
    svg.selectAll('.links line').attr('opacity', 0.6);
    svg.selectAll('.labels text').attr('opacity', 1);
  }
}
