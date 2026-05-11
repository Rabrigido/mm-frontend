/**
 * Base Graph Component
 * Abstract base class for all D3-based graph visualizations.
 * Manages D3 force simulation lifecycle, node/link/enclosure rendering, zoom, and interaction.
 * Subclasses override physics config, colors, radii, and node filtering via abstract methods.
 */

import { Component, ElementRef, Input, Output, EventEmitter, OnInit, OnDestroy, ViewChild, inject, signal } from '@angular/core';
import * as d3 from 'd3';
import { D3_CONFIG, D3ColorUtils } from '../config/d3-config';
import { GraphDataService } from '../services/graph-data.service';
import { NodeType, GraphNode, GraphLink } from '../types/graph.types';
import { downloadSvg, downloadPng } from './common/component.utils';
 
/**
 * Render-specific node data (includes D3 simulation data)
 */
export interface RenderNode extends d3.SimulationNodeDatum {
  id: string;
  label: string;
  type: NodeType;
  parentId?: string;
  r: number;
  color: string;
  data: GraphNode;
}

/**
 * Render-specific link data
 */
export interface RenderLink extends d3.SimulationLinkDatum<RenderNode> {
  source: RenderNode;
  target: RenderNode;
  value: number;
}

/**
 * Enclosure bubble for folder visualization
 */
export interface Enclosure {
  id: string;
  x: number;
  y: number;
  r: number;
  label: string;
  color: string;
}

/**
 * Physics configuration for a specific graph type
 */
export interface PhysicsConfig {
  chargeStrength: number;
  linkDistance: number;
  centerStrength: number;
  collidePadding: number;
  collideIterations: number;
  clusterStrength?: number;
  enclosurePushForce?: number;
  enclosureLeashForce?: number;
}

/**
 * Abstract base class for D3 force-directed graph visualizations.
 *
 * Forces: charge (repulsion), link (spring), center (gravity), collide (collision),
 *         cluster (group by parent), enclosure (keep children inside parent bubbles).
 *
 * Subclasses MUST implement:
 * - getPhysicsConfig()      -> PhysicsConfig
 * - getColorScheme()        -> Record<string, string>
 * - getRadiusScheme()       -> Record<string, number>
 * - filterNodesAndLinks()   -> void
 */
@Component({
  template: '', // Subclasses must define template
})
export abstract class BaseGraphComponent implements OnInit, OnDestroy {
  protected dataService = inject(GraphDataService);

  @Input({ required: true }) repoId!: string;
  @Output() openDetailsModal = new EventEmitter<void>();
  @ViewChild('graphContainer', { static: true }) container!: ElementRef;

  // State signals
  loading = signal(true);
  error = signal<string | null>(null);
  separation = signal(1);

  // Internal state
  protected allNodesMap = new Map<string, GraphNode>();
  allLinks: GraphLink[] = [];

  /** Public accessor for tree modal and other consumers */
  get allNodes(): GraphNode[] {
    return Array.from(this.allNodesMap.values());
  }

  protected nodes: RenderNode[] = [];
  protected links: RenderLink[] = [];
  protected expandedNodes = new Set<string>();
  protected hiddenNodes = signal(new Set<string>());
  protected currentEnclosures: Enclosure[] = [];

  // D3 objects
  protected simulation: any;
  protected svg: any;
  protected width = D3_CONFIG.VIEWPORT.DEFAULT_WIDTH;
  protected height = D3_CONFIG.VIEWPORT.DEFAULT_HEIGHT;

  abstract getPhysicsConfig(): PhysicsConfig;
  abstract getColorScheme(): Record<string, string>;
  abstract getRadiusScheme(): Record<string, number>;

  /**
   * Post-load hook to filter/transform nodes and links before simulation starts.
   * Called once after data is fetched and parsed.
   */
  abstract filterNodesAndLinks(): void;

  ngOnInit() {
    this.loadGraph();
  }

  ngOnDestroy() {
    if (this.simulation) this.simulation.stop();
  }

  /**
   * Fetches hierarchy data, builds nodes/links, then initializes the D3 simulation.
   */
  private loadGraph() {
    this.loading.set(true);
    this.dataService.loadHierarchy(this.repoId).subscribe({
      next: (data) => {
        data.nodes.forEach(n => this.allNodesMap.set(n.id, n));
        this.allLinks = data.links;

        // Filter/transform nodes and links (subclass-specific)
        this.filterNodesAndLinks();

        // Initialize rendering
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

  /**
   * Converts a GraphNode into a RenderNode with computed radius, color, and position.
   */
  protected createRenderNode(n: GraphNode, x = 0, y = 0): RenderNode {
    const radiusScheme = this.getRadiusScheme();
    const colorScheme = this.getColorScheme();

    return {
      id: n.id,
      label: n.label,
      type: n.type,
      parentId: n.parentId,
      data: n,
      x: x + (Math.random() - 0.5) * 10,
      y: y + (Math.random() - 0.5) * 10,
      r: radiusScheme[n.type] || 10,
      color: colorScheme[n.type] || '#999'
    };
  }

  /**
   * Sets up SVG with zoom layer, creates D3 force simulation with all forces,
   * and attaches tick handler to re-render nodes/links/enclosures on each frame.
   */
  private initSimulation() {
    const el = this.container.nativeElement;
    this.width = el.clientWidth || D3_CONFIG.VIEWPORT.DEFAULT_WIDTH;
    this.height = el.clientHeight || D3_CONFIG.VIEWPORT.DEFAULT_HEIGHT;

    // Clear previous SVG
    d3.select(el).selectAll('*').remove();

    // Create SVG with viewBox for scaling
    this.svg = d3.select(el).append('svg')
      .attr('width', this.width)
      .attr('height', this.height)
      .attr('viewBox', `${-this.width / 2} ${-this.height / 2} ${this.width} ${this.height}`);

    // Create defs for arrow markers
    this.svg.append('defs');

    // Create zoom layer
    const zoomLayer = this.svg.append('g').attr('class', 'zoom-layer');

    // Add zoom behavior
    this.svg.call(d3.zoom()
      .scaleExtent([D3_CONFIG.ZOOM.MIN, D3_CONFIG.ZOOM.MAX])
      .on('zoom', (e: any) => zoomLayer.attr('transform', e.transform))
    );

    // Create rendering layers
    const gEnclosures = zoomLayer.append('g').attr('class', 'enclosures');
    const gLinks = zoomLayer.append('g').attr('class', 'links');
    const gNodes = zoomLayer.append('g').attr('class', 'nodes');

    // Create force simulation
    const config = this.getPhysicsConfig();

    this.simulation = d3.forceSimulation(this.nodes)
      .force('charge', d3.forceManyBody().strength(config.chargeStrength))
      .force('link', d3.forceLink(this.links).id((d: any) => d.id).distance(config.linkDistance))
      .force('x', d3.forceX().strength(config.centerStrength))
      .force('y', d3.forceY().strength(config.centerStrength))
      .force('collide', d3.forceCollide().radius((d: any) => d.r + config.collidePadding).iterations(config.collideIterations))
      .force('cluster', this.forceCluster(config.clusterStrength || 0.2))
      .force('enclosure', this.forceEnclosure());

    // Render on every tick
    this.simulation.on('tick', () => {
      this.updateArrowMarkers();
      this.updateLinksForView(gLinks);
      this.rebuildLinks();
      this.updateNodes(gNodes);
      this.drawEnclosures(gEnclosures, this.currentEnclosures);
    });
  }

  /**
   * Renders/updates link lines with color based on coupling intensity.
   */
  private updateLinksForView(layer: any) {
    layer.selectAll('line')
      .data(this.links)
      .join('line')
      .attr('stroke', (d: any) => this.getLinkColor(d.value))
      .attr('stroke-opacity', D3_CONFIG.LINK.OPACITY)
      .attr('marker-end', (d: any) => `url(#arrowhead-${this.getLinkColor(d.value).replace('#', '')})`)
      .attr('x1', (d: any) => d.source.x)
      .attr('y1', (d: any) => d.source.y)
      .attr('x2', (d: any) => this.shortenLine(d.source, d.target).x)
      .attr('y2', (d: any) => this.shortenLine(d.source, d.target).y);
  }

  /**
   * Renders/updates node circles with labels, drag behavior, and click handler.
   */
  private updateNodes(layer: any) {
    const nodeSel = layer.selectAll('g.node')
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
      .attr('stroke-width', D3_CONFIG.NODE.STROKE_WIDTH);

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
  }

  /**
   * Custom force: pulls sibling nodes (same parentId) toward their centroid.
   */
  private forceCluster(strength: number) {
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

  /**
   * Custom force: leash force pulls descendant nodes inside their enclosure bubble;
   * push force pushes non-descendants outside.
   */
  private forceEnclosure() {
    return (alpha: number) => {
      const config = this.getPhysicsConfig();
      this.currentEnclosures = this.calculateEnclosures();

      this.currentEnclosures.forEach(enc => {
        this.nodes.forEach(node => {
          const isInside = this.isDescendant(node.id, enc.id);

          const dx = node.x! - enc.x;
          const dy = node.y! - enc.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 0.001;

          if (isInside) {
            // LEASH FORCE: Keep children inside
            const maxDist = enc.r - node.r - 5;
            if (dist > maxDist) {
              const k = (config.enclosureLeashForce || D3_CONFIG.ENCLOSURE.LEASH_FORCE) * alpha;
              const move = dist - maxDist;
              node.vx! -= (dx / dist) * move * k;
              node.vy! -= (dy / dist) * move * k;
            }
          } else {
            // PUSH FORCE: Keep outsiders out
            const minDist = enc.r + node.r + 10;
            if (dist < minDist) {
              const overlap = minDist - dist;
              const k = (config.enclosurePushForce || D3_CONFIG.ENCLOSURE.PUSH_FORCE) * alpha * 5;
              node.vx! += (dx / dist) * overlap * k;
              node.vy! += (dy / dist) * overlap * k;
            }
          }
        });
      });
    };
  }

  /**
   * Uses d3.packEnclose to compute minimum bounding circles around direct children of expanded nodes.
   */
  protected calculateEnclosures(): Enclosure[] {
    const enclosures: Enclosure[] = [];
    const colorScheme = this.getColorScheme();

    this.expandedNodes.forEach(parentId => {
      const directChildren = this.nodes.filter(n => n.parentId === parentId);

      if (directChildren.length > 0) {
        const pData = this.allNodesMap.get(parentId);
        const circle = d3.packEnclose(directChildren as any);
        if (circle) {
          enclosures.push({
            id: parentId,
            x: circle.x,
            y: circle.y,
            r: circle.r + D3_CONFIG.ENCLOSURE.PADDING,
            label: pData?.label || '',
            color: colorScheme[pData?.type as NodeType] || '#ccc'
          });
        }
      }
    });
    return enclosures;
  }

  /**
   * Walks the parent chain from nodeId upward; returns true if ancestorId is found.
   */
  protected isDescendant(nodeId: string, ancestorId: string): boolean {
    let curr = this.allNodesMap.get(nodeId);
    while (curr && curr.parentId) {
      if (curr.parentId === ancestorId) return true;
      curr = this.allNodesMap.get(curr.parentId);
    }
    return false;
  }

  /**
   * Filters allLinks to only those between visible nodes.
   * If a link endpoint is hidden, walks up to find the nearest visible ancestor.
   * Aggregates parallel links by summing their value.
   */
  protected rebuildLinks() {
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
      const sourceId = findVisible(l.source as string);
      const targetId = findVisible(l.target as string);

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

  /**
   * Toggles node visibility from the tree modal. Hides/shows the node and its descendants,
   * then restarts the simulation to re-layout.
   */
  onNodeSelected(nodeId: string): void {
    const hidden = new Set(this.hiddenNodes());
    if (hidden.has(nodeId)) {
      hidden.delete(nodeId);
      // Re-add node if it's now visible
      const nodeData = this.allNodesMap.get(nodeId);
      if (nodeData) {
        this.nodes.push(this.createRenderNode(nodeData));
      }
    } else {
      hidden.add(nodeId);
      // Remove node and its descendants from current visible nodes
      this.nodes = this.nodes.filter(n => n.id !== nodeId && !this.isDescendant(n.id, nodeId));
      // Also remove from expanded nodes if it was expanded
      this.expandedNodes.delete(nodeId);
    }
    this.hiddenNodes.set(hidden);

    this.updateSimulationState();
  }

  /**
   * Expands a node by replacing it with its children at the same position.
   */
  protected handleNodeClick(event: MouseEvent, node: RenderNode) {
    const original = this.allNodesMap.get(node.id);
    if (!original || !original.children || original.children.length === 0) return;

    this.expandedNodes.add(node.id);
    this.nodes = this.nodes.filter(n => n.id !== node.id);

    const children = original.children
      .filter(c => !this.hiddenNodes().has(c.id))
      .map(c => this.createRenderNode(c, node.x, node.y));
    this.nodes.push(...children);

    this.updateSimulationState();
  }

  /**
   * Collapses expanded children back into the parent node at the enclosure center.
   */
  protected collapse(parentId: string) {
    this.expandedNodes.delete(parentId);
    this.nodes = this.nodes.filter(n => !this.isDescendant(n.id, parentId));

    const parentData = this.allNodesMap.get(parentId)!;
    const enc = this.currentEnclosures.find(e => e.id === parentId);
    const x = enc ? enc.x : 0;
    const y = enc ? enc.y : 0;

    this.nodes.push(this.createRenderNode(parentData, x, y));
    this.updateSimulationState();
  }

  /**
   * Rebuilds links and restarts the simulation with updated node/link data.
   */
  protected updateSimulationState() {
    this.rebuildLinks();
    this.simulation.nodes(this.nodes);
    this.simulation.force('link').links(this.links);
    this.simulation.alpha(0.8).restart();
  }

  /**
   * Truncates the line at the target's edge so the arrowhead doesn't overlap the circle.
   */
  protected shortenLine(source: any, target: any) {
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

  /**
   * Renders/updates enclosure (parent) bubbles with dashed stroke, label, and collapse-on-click.
   */
  protected drawEnclosures(layer: any, enclosures: Enclosure[]) {
    const sel = layer.selectAll('g.enclosure')
      .data(enclosures, (d: any) => d.id);

    const enter = sel.enter().append('g').attr('class', 'enclosure');

    enter.append('circle')
      .attr('fill', (d: any) => d.color)
      .attr('fill-opacity', D3_CONFIG.ENCLOSURE.FILL_OPACITY)
      .attr('stroke', (d: any) => d.color)
      .attr('stroke-opacity', D3_CONFIG.ENCLOSURE.STROKE_OPACITY)
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

  /**
   * Blends color from mid to red based on link value (capped at 10).
   */
  protected getLinkColor(value: number): string {
    return D3ColorUtils.blendColors(D3_CONFIG.LINK.COLOR_MID, '#ef4444', Math.min(value / 10, 1));
  }

  /**
   * Creates/updates SVG marker definitions for arrowheads matching link colors.
   */
  private updateArrowMarkers() {
    if (!this.links || this.links.length === 0) return;

    const uniqueColors = new Set(this.links.map(l => this.getLinkColor(l.value)));

    d3.select(this.svg.node().querySelector('defs'))
      .selectAll('marker')
      .data(Array.from(uniqueColors), (d: any) => d)
      .join(
        (enter: any) => enter.append('marker')
          .attr('id', (d: any) => `arrowhead-${d.replace('#', '')}`)
          .attr('viewBox', '0 -5 10 10')
          .attr('refX', 20)
          .attr('refY', 0)
          .attr('markerWidth', 6)
          .attr('markerHeight', 6)
          .attr('orient', 'auto')
          .append('path')
          .attr('d', 'M0,-5L10,0L0,5')
          .attr('fill', (d: any) => d)
      );
  }

  /**
   * Expands every expandable node in batches (5 per 500ms) for animated reveal.
   */
  expandAll() {
    const nodesToExpand: string[] = [];

    this.allNodesMap.forEach((node) => {
      if (node.children && node.children.length > 0) {
        nodesToExpand.push(node.id);
      }
    });

    let delay = 0;
    const batchSize = 5;

    for (let i = 0; i < nodesToExpand.length; i += batchSize) {
      const batch = nodesToExpand.slice(i, i + batchSize);

      setTimeout(() => {
        batch.forEach(nodeId => {
          const nodeData = this.allNodesMap.get(nodeId);
          if (!nodeData) return;

          if (!this.expandedNodes.has(nodeId)) {
            this.expandedNodes.add(nodeId);
            const parentIndex = this.nodes.findIndex(n => n.id === nodeId);
            if (parentIndex !== -1) {
              const parentNode = this.nodes[parentIndex];
              this.nodes.splice(parentIndex, 1);

              if (nodeData.children) {
                const children = nodeData.children
                  .filter(c => !this.hiddenNodes().has(c.id))
                  .map(c =>
                    this.createRenderNode(c, parentNode.x || 0, parentNode.y || 0)
                  );
                this.nodes.push(...children);
              }
            }
          }
        });

        this.updateSimulationState();
      }, delay);

      delay += 500;
    }
  }

  /**
   * Collapses every expanded node in reverse-depth order (deepest first) in batches.
   */
  collapseAll() {
    const toCollapse = Array.from(this.expandedNodes).sort((a, b) => {
      const depthA = this.getNodeDepth(a);
      const depthB = this.getNodeDepth(b);
      return depthB - depthA;
    });

    let delay = 0;
    const batchSize = 5;

    for (let i = 0; i < toCollapse.length; i += batchSize) {
      const batch = toCollapse.slice(i, i + batchSize);

      setTimeout(() => {
        batch.forEach(nodeId => {
          if (this.expandedNodes.has(nodeId)) {
            this.collapse(nodeId);
          }
        });
      }, delay);

      delay += 300;
    }
  }

  /**
   * Counts parent chain length from nodeId to root.
   */
  protected getNodeDepth(nodeId: string): number {
    let depth = 0;
    let curr = this.allNodesMap.get(nodeId);
    while (curr && curr.parentId) {
      depth++;
      curr = this.allNodesMap.get(curr.parentId);
    }
    return depth;
  }

  /**
   * Reads a slider value and applies it as the separation multiplier.
   */
  onSeparationChange(event: Event): void {
    const factor = parseFloat((event.target as HTMLInputElement).value);
    this.separation.set(factor);
    this.updateSeparation(factor);
  }

  /**
   * Scales charge, link distance, and collide padding by factor and restarts simulation.
   */
  private updateSeparation(factor: number): void {
    if (!this.simulation) return;
    const config = this.getPhysicsConfig();
    this.simulation
      .force('charge', d3.forceManyBody().strength(config.chargeStrength * factor))
      .force('link', d3.forceLink(this.links).id((d: any) => d.id).distance(config.linkDistance * factor))
      .force('collide', d3.forceCollide().radius((d: any) => d.r + config.collidePadding * factor).iterations(config.collideIterations));
    this.simulation.alpha(0.5).restart();
  }

  /**
   * Download graph as SVG
   */
  downloadSVG(): void {
    downloadSvg(this.container.nativeElement, 'dependency-graph.svg');
  }

  /**
   * Download graph as PNG
   */
  downloadPNG(): void {
    downloadPng(this.container.nativeElement, this.width, this.height, 'dependency-graph.png');
  }
}
