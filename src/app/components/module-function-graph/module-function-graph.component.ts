// (Same as ModuleClassGraphComponent but with filter for CALL links instead of COUPLING)
import { Component, ElementRef, Input, OnInit, OnDestroy, ViewChild, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import * as d3 from 'd3';
import { GraphDataService, GraphNode, GraphLink, NodeType } from '../../services/graph-data.service';

// --- CONSTANTS ---
const ZOOM_MIN = 0.1;
const ZOOM_MAX = 8;
const DEFAULT_WIDTH = 1000;
const DEFAULT_HEIGHT = 800;

const FORCE_CHARGE_STRENGTH = -300;
const FORCE_LINK_DISTANCE = 80;
const FORCE_CENTER_STRENGTH = 0.06;
const FORCE_COLLIDE_PADDING = 15;
const FORCE_COLLIDE_ITERATIONS = 2;

const ENCLOSURE_PADDING = 30;
const ENCLOSURE_PUSH_FORCE = 0.2;
const ENCLOSURE_LEASH_FORCE = 0.1;
const ENCLOSURE_FILL_OPACITY = 0.05;
const ENCLOSURE_STROKE_OPACITY = 0.4;

const ARROW_ID_FAN_OUT = 'arrowhead-func-fanout';
const ARROW_ID_FAN_IN = 'arrowhead-func-fanin';
const LINK_COLOR_FAN_OUT = '#10b981';  // Emerald
const LINK_COLOR_FAN_IN = '#10b981';   // Violet
const LINK_OPACITY = 0.6;
const NODE_STROKE_WIDTH = 2;

interface RenderNode extends d3.SimulationNodeDatum {
  id: string;
  label: string;
  type: NodeType;
  parentId?: string;
  r: number;
  color: string;
  data: GraphNode;
}

interface RenderLink extends d3.SimulationLinkDatum<RenderNode> {
  source: RenderNode;
  target: RenderNode;
  value: number;
}

interface Enclosure {
  id: string;
  x: number;
  y: number;
  r: number;
  label: string;
  color: string;
}

@Component({
  selector: 'app-module-function-graph',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './module-function-graph.component.html',
  styleUrls: ['./module-function-graph.component.css']
})
export class ModuleFunctionGraphComponent implements OnInit, OnDestroy {
  private dataService = inject(GraphDataService);

  @Input({ required: true }) repoId!: string;
  @ViewChild('graphContainer', { static: true }) container!: ElementRef;

  loading = signal(true);
  error = signal<string | null>(null);

  private allNodesMap = new Map<string, GraphNode>();
  private allLinks: GraphLink[] = [];

  private nodes: RenderNode[] = [];
  private links: RenderLink[] = [];
  private expandedNodes = new Set<string>();

  private currentEnclosures: Enclosure[] = [];

  private simulation: any;
  private svg: any;
  private width = DEFAULT_WIDTH;
  private height = DEFAULT_HEIGHT;

  private readonly COLORS = {
    DIRECTORY: '#f59e0b',
    FILE: '#64748b',
    CLASS: '#ec4899',
    FUNCTION: '#10b981',
    MODULE: '#6366f1'
  };

  private readonly RADIUS = {
    DIRECTORY: 35,
    FILE: 20,
    CLASS: 12,
    FUNCTION: 6,
    MODULE: 20
  };

  ngOnInit() {
    this.loadGraph();
  }

  ngOnDestroy() {
    if (this.simulation) this.simulation.stop();
  }

  private loadGraph() {
    this.loading.set(true);
    this.dataService.loadHierarchy(this.repoId).subscribe({
      next: (data) => {
        // FILTER: Only keep DIRECTORY, FILE, and FUNCTION nodes
        const filteredNodes = data.nodes.filter(n =>
          n.type === 'DIRECTORY' || n.type === 'FILE' || n.type === 'FUNCTION'
        );

        filteredNodes.forEach(n => this.allNodesMap.set(n.id, n));

        // Only keep CALL links between visible nodes
        this.allLinks = data.links.filter(l =>
          l.type === 'CALL' &&
          filteredNodes.some(n => n.id === l.source) &&
          filteredNodes.some(n => n.id === l.target)
        );

        // Start with root directories only
        const rootNodes = filteredNodes.filter(n => !n.parentId);

        this.nodes = rootNodes.map(n => this.createRenderNode(n));
        this.updateLinks();
        this.initSimulation();
        this.loading.set(false);
      },
      error: (err) => {
        console.error(err);
        this.error.set('Error loading graph data');
        this.loading.set(false);
      }
    });
  }

  private createRenderNode(n: GraphNode, x = 0, y = 0): RenderNode {
    return {
      id: n.id,
      label: n.label,
      type: n.type,
      parentId: n.parentId,
      data: n,
      x: x + (Math.random() - 0.5) * 10,
      y: y + (Math.random() - 0.5) * 10,
      r: this.RADIUS[n.type] || 10,
      color: this.COLORS[n.type] || '#999'
    };
  }

  private initSimulation() {
    const el = this.container.nativeElement;
    this.width = el.clientWidth || DEFAULT_WIDTH;
    this.height = el.clientHeight || DEFAULT_HEIGHT;

    d3.select(el).selectAll('*').remove();

    this.svg = d3.select(el).append('svg')
      .attr('width', this.width)
      .attr('height', this.height)
      .attr('viewBox', `${-this.width / 2} ${-this.height / 2} ${this.width} ${this.height}`);

    this.svg.append('defs').append('marker')
      .attr('id', ARROW_ID_FAN_OUT)
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 20)
      .attr('refY', 0)
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-5L10,0L0,5')
      .attr('fill', LINK_COLOR_FAN_OUT);

    this.svg.append('defs').append('marker')
      .attr('id', ARROW_ID_FAN_IN)
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 20)
      .attr('refY', 0)
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-5L10,0L0,5')
      .attr('fill', LINK_COLOR_FAN_IN);

    const zoomLayer = this.svg.append('g').attr('class', 'zoom-layer');

    this.svg.call(d3.zoom()
      .scaleExtent([ZOOM_MIN, ZOOM_MAX])
      .on('zoom', (e: any) => zoomLayer.attr('transform', e.transform))
    );

    const gEnclosures = zoomLayer.append('g').attr('class', 'enclosures');
    const gLinks = zoomLayer.append('g').attr('class', 'links');
    const gNodes = zoomLayer.append('g').attr('class', 'nodes');

    this.simulation = d3.forceSimulation(this.nodes)
      .force('charge', d3.forceManyBody().strength(FORCE_CHARGE_STRENGTH))
      .force('link', d3.forceLink(this.links).id((d: any) => d.id).distance(FORCE_LINK_DISTANCE))
      .force('x', d3.forceX().strength(FORCE_CENTER_STRENGTH))
      .force('y', d3.forceY().strength(FORCE_CENTER_STRENGTH))
      .force('collide', d3.forceCollide().radius((d: any) => d.r + FORCE_COLLIDE_PADDING).iterations(FORCE_COLLIDE_ITERATIONS))
      .force('cluster', this.forceCluster())
      .force('enclosure', this.forceEnclosure());

    this.simulation.on('tick', () => {
      gLinks.selectAll('line')
        .data(this.links)
        .join('line')
        .attr('stroke', (d: any) => d.source.data.type === 'FUNCTION' && (d.source as any).direction === 'fan-in' ? LINK_COLOR_FAN_IN : LINK_COLOR_FAN_OUT)
        .attr('stroke-opacity', LINK_OPACITY)
        .attr('stroke-width', (d: any) => {
          // Scale thickness: 1.5 base + 0.3 per count (max ~3.5)
          return Math.min(3.5, 1.5 + (d.value * 0.3));
        })
        .attr('marker-end', (d: any) => {
          // Check if this is a fan-in or fan-out link
          const linkData = this.allLinks.find(l => l.source === d.source.id && l.target === d.target.id);
          return `url(#${linkData?.direction === 'fan-in' ? ARROW_ID_FAN_IN : ARROW_ID_FAN_OUT})`;
        })
        .attr('x1', (d: any) => d.source.x)
        .attr('y1', (d: any) => d.source.y)
        .attr('x2', (d: any) => this.shortenLine(d.source, d.target).x)
        .attr('y2', (d: any) => this.shortenLine(d.source, d.target).y);

      const nodeSel = gNodes.selectAll('g.node')
        .data(this.nodes, (d: any) => d.id);

      const nodeEnter = nodeSel.enter().append('g')
        .attr('class', 'node')
        .style('cursor', 'pointer')
        .call(d3.drag()
          .on('start', (e, d: any) => {
            if (!e.active) this.simulation.alphaTarget(0.3).restart();
            d.fx = d.x; d.fy = d.y;
          })
          .on('drag', (e, d: any) => { d.fx = e.x; d.fy = e.y; })
          .on('end', (e, d: any) => {
            if (!e.active) this.simulation.alphaTarget(0);
            d.fx = null; d.fy = null;
          })
        )
        .on('click', (e: any, d: RenderNode) => this.handleNodeClick(e, d));

      nodeEnter.append('circle')
        .attr('r', (d: any) => d.r)
        .attr('fill', (d: any) => d.color)
        .attr('stroke', '#fff')
        .attr('stroke-width', NODE_STROKE_WIDTH);

      nodeEnter.append('text')
        .text((d: any) => d.label)
        .attr('dy', (d: any) => d.r + 14)
        .attr('text-anchor', 'middle')
        .attr('fill', '#475569')
        .style('font-size', '10px')
        .style('pointer-events', 'none');

      nodeSel.merge(nodeEnter as any)
        .attr('transform', (d: any) => `translate(${d.x},${d.y})`);

      nodeSel.exit().remove();

      this.drawEnclosures(gEnclosures, this.currentEnclosures);
    });
  }

  private forceCluster() {
    const strength = 0.2;
    return (alpha: number) => {
      const groups = d3.group(this.nodes, d => d.parentId);
      groups.forEach((groupNodes) => {
        if (groupNodes.length <= 1) return;

        let cx = 0, cy = 0;
        groupNodes.forEach(n => { cx += n.x!; cy += n.y!; });
        cx /= groupNodes.length;
        cy /= groupNodes.length;

        const k = strength * alpha;
        groupNodes.forEach(n => {
          n.vx! -= (n.x! - cx) * k;
          n.vy! -= (n.y! - cy) * k;
        });
      });
    };
  }

  private forceEnclosure() {
    return (alpha: number) => {
      this.currentEnclosures = this.calculateEnclosures();

      this.currentEnclosures.forEach(enc => {
        this.nodes.forEach(node => {
          const isInside = this.isDescendant(node.id, enc.id);

          const dx = node.x! - enc.x;
          const dy = node.y! - enc.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 0.001;

          if (isInside) {
            const maxDist = enc.r - node.r - 5;
            if (dist > maxDist) {
              const k = ENCLOSURE_LEASH_FORCE * alpha;
              const move = dist - maxDist;
              node.vx! -= (dx / dist) * move * k;
              node.vy! -= (dy / dist) * move * k;
            }
          } else {
            const minDist = enc.r + node.r + 10;
            if (dist < minDist) {
              const overlap = minDist - dist;
              const k = ENCLOSURE_PUSH_FORCE * alpha * 5;
              node.vx! += (dx / dist) * overlap * k;
              node.vy! += (dy / dist) * overlap * k;
            }
          }
        });
      });
    };
  }

  private calculateEnclosures(): Enclosure[] {
    const enclosures: Enclosure[] = [];
    this.expandedNodes.forEach(parentId => {
      const descendants = this.nodes.filter(n => this.isDescendant(n.id, parentId));

      if (descendants.length > 0) {
        const pData = this.allNodesMap.get(parentId);
        const circle = d3.packEnclose(descendants as any);
        if (circle) {
          enclosures.push({
            id: parentId,
            x: circle.x,
            y: circle.y,
            r: circle.r + ENCLOSURE_PADDING,
            label: pData?.label || '',
            color: this.COLORS[pData?.type as NodeType] || '#ccc'
          });
        }
      }
    });
    return enclosures;
  }

  private isDescendant(nodeId: string, ancestorId: string): boolean {
    let curr = this.allNodesMap.get(nodeId);
    while (curr && curr.parentId) {
      if (curr.parentId === ancestorId) return true;
      curr = this.allNodesMap.get(curr.parentId);
    }
    return false;
  }

  private updateLinks() {
    const visibleNodeIds = new Set(this.nodes.map(n => n.id));
    const visibleNodeMap = new Map(this.nodes.map(n => [n.id, n]));
    const newLinks = new Map<string, RenderLink>();

    const findVisible = (id: string): string | undefined => {
      if (visibleNodeIds.has(id)) return id;
      let curr = this.allNodesMap.get(id);
      while (curr && curr.parentId) {
        if (visibleNodeIds.has(curr.parentId)) return curr.parentId;
        curr = this.allNodesMap.get(curr.parentId);
      }
      return undefined;
    };

    this.allLinks.forEach(l => {
      const sourceId = findVisible(l.source);
      const targetId = findVisible(l.target);

      if (sourceId && targetId && sourceId !== targetId) {
        const key = `${sourceId}-${targetId}`;
        if (!newLinks.has(key)) {
          newLinks.set(key, {
            source: visibleNodeMap.get(sourceId)!,
            target: visibleNodeMap.get(targetId)!,
            value: 1
          });
        } else {
          newLinks.get(key)!.value++;
        }
      }
    });

    this.links = Array.from(newLinks.values());
  }

  private handleNodeClick(event: MouseEvent, node: RenderNode) {
    const original = this.allNodesMap.get(node.id);
    if (!original || !original.children || original.children.length === 0) return;

    this.expandedNodes.add(node.id);
    this.nodes = this.nodes.filter(n => n.id !== node.id);

    const childrenToAdd = original.children
      .filter(c => c.type === 'DIRECTORY' || c.type === 'FILE' || c.type === 'FUNCTION' )
      .map(c => this.createRenderNode(c, node.x, node.y));

    this.nodes.push(...childrenToAdd);

    this.updateSimulation();
  }

  private collapse(parentId: string) {
    this.expandedNodes.delete(parentId);
    this.nodes = this.nodes.filter(n => !this.isDescendant(n.id, parentId));

    const parentData = this.allNodesMap.get(parentId)!;
    const enc = this.currentEnclosures.find(e => e.id === parentId);
    const x = enc ? enc.x : 0;
    const y = enc ? enc.y : 0;

    this.nodes.push(this.createRenderNode(parentData, x, y));

    this.updateSimulation();
  }

  private updateSimulation() {
    this.updateLinks();
    this.simulation.nodes(this.nodes);
    this.simulation.force('link').links(this.links);
    this.simulation.alpha(0.8).restart();
  }

  private shortenLine(source: any, target: any) {
    const dx = target.x - source.x;
    const dy = target.y - source.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist === 0) return { x: target.x, y: target.y };

    const gap = target.r + 8;
    const t = 1 - gap / dist;

    if (t < 0) return { x: target.x, y: target.y };

    return {
      x: source.x + dx * t,
      y: source.y + dy * t
    };
  }

  private drawEnclosures(layer: any, enclosures: Enclosure[]) {
    const sel = layer.selectAll('g.enclosure')
      .data(enclosures, (d: any) => d.id);

    const enter = sel.enter().append('g').attr('class', 'enclosure');

    enter.append('circle')
      .attr('fill', (d: any) => d.color)
      .attr('fill-opacity', ENCLOSURE_FILL_OPACITY)
      .attr('stroke', (d: any) => d.color)
      .attr('stroke-opacity', ENCLOSURE_STROKE_OPACITY)
      .attr('stroke-dasharray', '4 2')
      .attr('stroke-width', 1.5)
      .on('click', (e: any, d: Enclosure) => this.collapse(d.id));

    enter.append('text')
      .attr('text-anchor', 'middle')
      .attr('fill', (d: any) => d.color)
      .style('font-size', '11px')
      .style('font-weight', 'bold')
      .style('pointer-events', 'none')
      .style('text-transform', 'uppercase');

    const merged = sel.merge(enter);

    merged.select('circle')
      .attr('cx', (d: any) => d.x)
      .attr('cy', (d: any) => d.y)
      .attr('r', (d: any) => d.r);

    merged.select('text')
      .text((d: any) => d.label)
      .attr('x', (d: any) => d.x)
      .attr('y', (d: any) => d.y - d.r - 8);

    sel.exit().remove();
  }
}