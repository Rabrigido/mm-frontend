import { Component, ElementRef, Input, OnInit, OnDestroy, ViewChild, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import * as d3 from 'd3';
import { GraphDataService, GraphNode, GraphLink, NodeType } from '../../services/graph-data.service';

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
  selector: 'app-hierarchical-graph',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './hierarchical-graph.component.html',
  styleUrls: ['./hierarchical-graph.component.css']
})
export class HierarchicalGraphComponent implements OnInit, OnDestroy {
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

  private simulation: any;
  private svg: any;
  private width = 1000;
  private height = 800;

  private readonly COLORS = {
    DIRECTORY: '#f59e0b', // Amber
    FILE: '#64748b',      // Slate
    CLASS: '#ec4899',     // Pink
    FUNCTION: '#10b981',  // Emerald
    MODULE: '#6366f1'     // Fallback
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
        data.nodes.forEach(n => this.allNodesMap.set(n.id, n));
        this.allLinks = data.links;

        // Initial State: Show only root nodes (nodes with no parent)
        const rootNodes = data.nodes.filter(n => !n.parentId);
        
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
    this.width = el.clientWidth || 1000;
    this.height = el.clientHeight || 800;

    d3.select(el).selectAll('*').remove();

    this.svg = d3.select(el).append('svg')
      .attr('width', this.width)
      .attr('height', this.height)
      .attr('viewBox', `${-this.width/2} ${-this.height/2} ${this.width} ${this.height}`);

    const zoomLayer = this.svg.append('g').attr('class', 'zoom-layer');
    
    this.svg.call(d3.zoom()
      .scaleExtent([0.1, 8])
      .on('zoom', (e: any) => zoomLayer.attr('transform', e.transform))
    );

    const gEnclosures = zoomLayer.append('g').attr('class', 'enclosures');
    const gLinks = zoomLayer.append('g').attr('class', 'links');
    const gNodes = zoomLayer.append('g').attr('class', 'nodes');

    this.simulation = d3.forceSimulation(this.nodes)
      .force('charge', d3.forceManyBody().strength(-400))
      .force('link', d3.forceLink(this.links).id((d: any) => d.id).distance(120))
      .force('x', d3.forceX())
      .force('y', d3.forceY())
      .force('collide', d3.forceCollide().radius((d: any) => d.r + 20).iterations(2));

    this.simulation.on('tick', () => {
      // Links
      gLinks.selectAll('line')
        .data(this.links)
        .join('line')
        .attr('stroke', '#94a3b8')
        .attr('stroke-opacity', 0.4)
        .attr('stroke-width', 1.5)
        .attr('x1', (d: any) => d.source.x)
        .attr('y1', (d: any) => d.source.y)
        .attr('x2', (d: any) => d.target.x)
        .attr('y2', (d: any) => d.target.y);

      // Nodes
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
        .attr('stroke-width', 2);
      
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

      // Enclosures
      this.drawEnclosures(gEnclosures);
    });
  }

  private drawEnclosures(layer: any) {
    const enclosures: Enclosure[] = [];

    this.expandedNodes.forEach(parentId => {
      const children = this.nodes.filter(n => n.parentId === parentId);
      if (children.length > 0) {
        const pData = this.allNodesMap.get(parentId);
        const circle = d3.packEnclose(children as any);
        if (circle) {
          enclosures.push({
            id: parentId,
            x: circle.x,
            y: circle.y,
            r: circle.r + 15,
            label: pData?.label || '',
            color: this.COLORS[pData?.type as NodeType] || '#ccc'
          });
        }
      }
    });

    const sel = layer.selectAll('g.enclosure')
      .data(enclosures, (d: any) => d.id);

    const enter = sel.enter().append('g').attr('class', 'enclosure');

    enter.append('circle')
      .attr('fill', (d: any) => d.color)
      .attr('fill-opacity', 0.1)
      .attr('stroke', (d: any) => d.color)
      .attr('stroke-opacity', 0.5)
      .attr('stroke-dasharray', '4 2')
      .on('click', (e: any, d: Enclosure) => this.collapse(d.id));

    enter.append('text')
      .attr('text-anchor', 'middle')
      .attr('fill', (d: any) => d.color)
      .style('font-size', '12px')
      .style('font-weight', 'bold')
      .style('pointer-events', 'none');

    const merged = sel.merge(enter);

    merged.select('circle')
      .transition().duration(300)
      .attr('cx', (d: any) => d.x)
      .attr('cy', (d: any) => d.y)
      .attr('r', (d: any) => d.r);

    merged.select('text')
      .text((d: any) => d.label)
      .attr('x', (d: any) => d.x)
      .attr('y', (d: any) => d.y - d.r - 5);

    sel.exit().remove();
  }

  private handleNodeClick(event: MouseEvent, node: RenderNode) {
    const original = this.allNodesMap.get(node.id);
    if (!original || !original.children || original.children.length === 0) return;
    this.expand(node);
  }

  private expand(parent: RenderNode) {
    this.expandedNodes.add(parent.id);
    this.nodes = this.nodes.filter(n => n.id !== parent.id);
    
    const children = this.allNodesMap.get(parent.id)!.children!;
    const newNodes = children.map(c => this.createRenderNode(c, parent.x, parent.y));
    this.nodes.push(...newNodes);
    
    this.updateSimulation();
  }

  private collapse(parentId: string) {
    this.expandedNodes.delete(parentId);
    
    const isDescendant = (id: string): boolean => {
      const n = this.allNodesMap.get(id);
      if (!n || !n.parentId) return false;
      if (n.parentId === parentId) return true;
      return isDescendant(n.parentId);
    };

    this.nodes = this.nodes.filter(n => !isDescendant(n.id));
    
    const parentData = this.allNodesMap.get(parentId)!;
    // Find center of current children to place parent
    const children = this.nodes.filter(n => n.parentId === parentId); // Actually they are gone now? No, wait.
    // We removed descendants above. We need to place parent somewhere.
    // Let's place it at 0,0 or try to find where the group was.
    // For simplicity, 0,0 or random is fine, the force will fix it.
    this.nodes.push(this.createRenderNode(parentData, 0, 0));
    
    this.updateSimulation();
  }

  private updateSimulation() {
    this.updateLinks();
    this.simulation.nodes(this.nodes);
    this.simulation.force('link').links(this.links);
    this.simulation.alpha(0.8).restart();
  }

  private updateLinks() {
    // Aggregate links: Find highest visible ancestor for every link in the system
    const visibleNodeIds = new Set(this.nodes.map(n => n.id));
    const visibleNodeMap = new Map(this.nodes.map(n => [n.id, n]));
    const newLinks = new Map<string, RenderLink>();

    // Helper to find visible ancestor
    const findVisible = (id: string): string | undefined => {
      let curr: string | undefined = id;
      while (curr) {
        if (visibleNodeIds.has(curr)) return curr;
        curr = this.allNodesMap.get(curr)?.parentId;
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
        }
      }
    });

    this.links = Array.from(newLinks.values());
  }
}