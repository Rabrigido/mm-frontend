import { Component, ElementRef, Input, OnInit, OnDestroy, ViewChild, inject, effect, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import * as d3 from 'd3';
import { GraphDataService, GraphNode, GraphLink } from '../../services/graph-data.service';

interface RenderNode extends d3.SimulationNodeDatum {
  id: string;
  label: string;
  type: 'MODULE' | 'FILE' | 'CLASS' | 'FUNCTION'; // Added FILE
  parentId?: string;
  r: number;
  color: string;
  data: GraphNode; // Original data ref
}

interface RenderLink extends d3.SimulationLinkDatum<RenderNode> {
  source: RenderNode;
  target: RenderNode;
  value: number;
}

interface GroupEnclosure {
  id: string;
  x: number;
  y: number;
  r: number;
  label: string;
  opacity: number;
}

@Component({
  selector: 'app-hierarchical-graph',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './hierarchical-graph.component.html',
})
export class HierarchicalGraphComponent implements OnInit, OnDestroy {
  private dataService = inject(GraphDataService);
  
  @Input({ required: true }) repoId!: string;
  @ViewChild('graphContainer', { static: true }) container!: ElementRef;

  loading = signal(true);
  error = signal<string | null>(null);
  selectedNode = signal<RenderNode | null>(null);

  // Global data store
  private allNodesMap = new Map<string, GraphNode>();
  private allLinks: GraphLink[] = [];

  // Visible state
  private nodes: RenderNode[] = [];
  private links: RenderLink[] = [];
  private expandedIds = new Set<string>();
  
  // D3 vars
  private svg: any;
  private simulation: any;
  private width = 1000;
  private height = 700;

  // Colors
  private colorScale = {
    MODULE: '#6366f1', // Indigo (Folders)
    FILE: '#64748b',   // Slate (Files)
    CLASS: '#ec4899',  // Pink (Classes)
    FUNCTION: '#10b981' // Emerald (Functions)
  };

  ngOnInit() {
    this.loadData();
  }

  ngOnDestroy() {
    if (this.simulation) this.simulation.stop();
  }

  private loadData() {
    this.loading.set(true);
    this.dataService.loadHierarchy(this.repoId).subscribe({
      next: (data) => {
        data.nodes.forEach(n => this.allNodesMap.set(n.id, n));
        this.allLinks = data.links;
        
        // Initial state: Show only Modules (top level)
        // or nodes with no parent that are in our map
        const roots = data.nodes.filter(n => n.type === 'MODULE' || !n.parentId);
        
        this.nodes = roots.map(n => this.createRenderNode(n));
        this.updateLinks(); // Find links only between visible nodes
        
        this.initGraph();
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set('Could not load graph data');
        this.loading.set(false);
      }
    });
  }

  private createRenderNode(n: GraphNode, x = 0, y = 0): RenderNode {
    return {
      id: n.id,
      label: n.label,
      type: n.type as any,
      parentId: n.parentId,
      data: n,
      x: x + (Math.random() - 0.5) * 10, // Jitter to prevent overlap
      y: y + (Math.random() - 0.5) * 10,
      r: this.getRadius(n.type),
      color: (this.colorScale as any)[n.type] || '#94a3b8'
    };
  }

  private getRadius(type: string): number {
    switch(type) {
      case 'MODULE': return 30; // Largest: Folders
      case 'FILE': return 20;   // Medium: Files
      case 'CLASS': return 12;  // Small: Classes
      case 'FUNCTION': return 6; // Smallest: Functions
      default: return 5;
    }
  }

  private initGraph() {
    const el = this.container.nativeElement;
    this.width = el.clientWidth || 1000;
    this.height = el.clientHeight || 700;

    d3.select(el).selectAll('*').remove();

    this.svg = d3.select(el).append('svg')
      .attr('width', this.width)
      .attr('height', this.height)
      .attr('viewBox', `${-this.width / 2} ${-this.height / 2} ${this.width} ${this.height}`)
      .style('font', '12px sans-serif');

    // 1. Create a container group for Zoom
    // This prevents the zoom from distorting individual nodes
    const zoomLayer = this.svg.append('g').attr('class', 'zoom-layer');

    // 2. Apply zoom to the SVG, but transform the zoomLayer
    const zoom = d3.zoom().scaleExtent([0.1, 8]).on('zoom', (e: any) => {
      zoomLayer.attr('transform', e.transform);
    });
    this.svg.call(zoom);

    // 3. Append visual layers to the zoomLayer
    const gEnclosure = zoomLayer.append('g').attr('class', 'enclosures');
    const gLinks = zoomLayer.append('g').attr('class', 'links');
    const gNodes = zoomLayer.append('g').attr('class', 'nodes');

    // Simulation
    this.simulation = d3.forceSimulation(this.nodes)
      .force('charge', d3.forceManyBody().strength(-300))
      .force('link', d3.forceLink(this.links).id((d: any) => d.id).distance(100))
      .force('x', d3.forceX())
      .force('y', d3.forceY())
      .force('collide', d3.forceCollide().radius((d: any) => d.r + 10).iterations(2));

    // Render Loop
    this.simulation.on('tick', () => {
      // 1. Links
      gLinks.selectAll('line')
        .data(this.links)
        .join('line')
        .attr('stroke', '#999')
        .attr('stroke-opacity', 0.6)
        .attr('x1', (d: any) => d.source.x)
        .attr('y1', (d: any) => d.source.y)
        .attr('x2', (d: any) => d.target.x)
        .attr('y2', (d: any) => d.target.y);

      // 2. Nodes
      const nodeSel = gNodes.selectAll('g')
        .data(this.nodes, (d: any) => d.id);

      const nodeEnter = nodeSel.enter().append('g')
        .attr('cursor', 'pointer')
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
        .on('click', (e: any, d: RenderNode) => this.toggleNode(d));

      nodeEnter.append('circle')
        .attr('r', (d: any) => d.r)
        .attr('fill', (d: any) => d.color)
        .attr('stroke', '#fff')
        .attr('stroke-width', 2);

      nodeEnter.append('text')
        .text((d: any) => d.label)
        .attr('dy', (d: any) => d.r + 12)
        .attr('text-anchor', 'middle')
        .attr('fill', '#333')
        .attr('stroke', 'white')
        .attr('stroke-width', 0.5)
        .style('font-size', (d: any) => d.type === 'MODULE' ? '12px' : '10px');

      nodeSel.merge(nodeEnter as any)
        .attr('transform', (d: any) => `translate(${d.x},${d.y})`);

      nodeSel.exit().remove();

      // 3. Enclosures (The "packEnclose" magic)
      this.drawEnclosures(gEnclosure);
    });
  }

  /**
   * Uses d3.packEnclose to calculate and draw circles around children of expanded nodes
   */
  private drawEnclosures(layer: any) {
    // Find all groups: Nodes that are currently expanded
    const groups: GroupEnclosure[] = [];
    
    this.expandedIds.forEach(parentId => {
      // Find visible children for this parent
      const children = this.nodes.filter(n => n.parentId === parentId);
      if (children.length === 0) return;

      // d3.packEnclose expects {x, y, r} objects. Our RenderNodes have this.
      // It returns the smallest enclosing circle {x, y, r}
      const enclosure = d3.packEnclose(children as any);
      
      if (enclosure) {
        // Find label from original map
        const label = this.allNodesMap.get(parentId)?.label || parentId;
        groups.push({
          id: parentId,
          x: enclosure.x,
          y: enclosure.y,
          r: enclosure.r + 10, // Add padding
          label,
          opacity: this.allNodesMap.get(parentId)?.type === 'MODULE' ? 0.1 : 0.2
        });
      }
    });

    // Render the enclosure circles
    const sel = layer.selectAll('g.enclosure')
      .data(groups, (d: any) => d.id);

    const enter = sel.enter().append('g').attr('class', 'enclosure');
    
    enter.append('circle')
      .attr('fill', '#000')
      .attr('stroke', 'none');
    
    enter.append('text')
      .attr('dy', (d: any) => -d.r) // Label on top
      .attr('text-anchor', 'middle')
      .attr('fill', '#999')
      .style('font-size', '10px')
      .style('font-weight', 'bold');

    const merged = sel.merge(enter);
    
    merged.select('circle')
      .attr('cx', (d: any) => d.x)
      .attr('cy', (d: any) => d.y)
      .attr('r', (d: any) => d.r)
      .attr('opacity', (d: any) => d.opacity);

    merged.select('text')
      .text((d: any) => d.label)
      .attr('x', (d: any) => d.x)
      .attr('y', (d: any) => d.y - d.r - 5); // Position label above circle

    sel.exit().transition().duration(500).style('opacity', 0).remove();
  }

  private toggleNode(d: RenderNode) {
    const nodeData = this.allNodesMap.get(d.id);
    if (!nodeData || !nodeData.children || nodeData.children.length === 0) {
      // Leaf node (Function or empty Class), just select it
      this.selectedNode.set(d);
      return;
    }

    if (this.expandedIds.has(d.id)) {
      // Collapse: Remove children, bring back parent node
      this.collapse(d);
    } else {
      // Expand: Remove parent node, add children
      this.expand(d);
    }
    
    this.updateSimulation();
  }

  private expand(parent: RenderNode) {
    this.expandedIds.add(parent.id);
    
    // 1. Remove parent from visible nodes
    this.nodes = this.nodes.filter(n => n.id !== parent.id);
    
    // 2. Add children
    const childrenData = this.allNodesMap.get(parent.id)!.children!;
    const newNodes = childrenData.map(child => 
      this.createRenderNode(child, parent.x, parent.y) // Spawn at parent position
    );
    
    this.nodes.push(...newNodes);
    this.updateLinks();
  }

  private collapse(parentShim: RenderNode) {
    // NOTE: 'parentShim' passed here might be virtual if we clicked a boundary
    // But here we click the parent node itself to Expand.
    // To collapse, usually we need a button or click the Enclosure background.
    // For simplicity, this method exists but 'toggleNode' logic above 
    // assumes we clicked the NODE. If the node is expanded, it is NOT visible 
    // (replaced by children). 
    // So we need a way to collapse.
    // Let's implement "Click Enclosure to Collapse" in the enclosure render.
  }

  // Public method called from template or enclosure click
  collapseGroup(parentId: string) {
    if (!this.expandedIds.has(parentId)) return;
    this.expandedIds.delete(parentId);

    // 1. Remove all descendants from visible nodes
    // We need to do this recursively if we want deep collapse, 
    // but for now just remove immediate children of this parent
    // (and their children if they were expanded?)
    // Simpler: Remove any node whose ancestry includes parentId.
    
    const isDescendant = (n: RenderNode): boolean => {
       let curr = n.data;
       while(curr.parentId) {
         if (curr.parentId === parentId) return true;
         curr = this.allNodesMap.get(curr.parentId)!;
       }
       return false;
    };

    // Keep nodes that are NOT descendants
    this.nodes = this.nodes.filter(n => !isDescendant(n));

    // 2. Restore Parent Node
    const parentData = this.allNodesMap.get(parentId)!;
    // We don't know exact X/Y to restore to, use center of mass of removed nodes or 0
    this.nodes.push(this.createRenderNode(parentData, 0, 0));

    this.updateLinks();
    this.updateSimulation();
  }

  private updateLinks() {
    // Filter global links: both source and target must be in 'this.nodes'
    const visibleIds = new Set(this.nodes.map(n => n.id));
    
    this.links = this.allLinks
      .filter(l => visibleIds.has(l.source) && visibleIds.has(l.target))
      .map(l => ({...l} as any)); // Clone to avoid D3 mutating original references repeatedly
  }

  private updateSimulation() {
    this.simulation.nodes(this.nodes);
    this.simulation.force('link').links(this.links);
    this.simulation.alpha(1).restart();
  }
}