import { Component, OnInit, ElementRef, Input, inject, OnDestroy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Chart, registerables } from 'chart.js';
import * as d3 from 'd3';
import { MetricsService } from '../../services/metrics.service';

Chart.register(...registerables);

interface NodeData {
  id: string;
  fanIn: number;
  fanOut: number;
  x?: number;
  y?: number;
  fx?: number | null;
  fy?: number | null;
}

interface LinkData {
  source: string | NodeData;
  target: string | NodeData;
  value: number;
}

@Component({
  selector: 'app-class-coupling',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './class-coupling.component.html',
  styleUrls: ['./class-coupling.component.css']
})
export class ClassCouplingComponent implements OnInit, OnDestroy {
  private metricsService = inject(MetricsService);
  private el = inject(ElementRef);

  @Input({ required: true }) repoId!: string;

  loading = signal(false);
  error = signal<string | null>(null);

  private chart: Chart | null = null;
  private simulation: d3.Simulation<NodeData, LinkData> | null = null;

  ngOnInit(): void {
    this.loading.set(true);
    this.error.set(null);

    this.metricsService.getClassCoupling(this.repoId).subscribe({
      next: (data: any) => {
        console.log('Class coupling data:', data);
        if (data?.result) {
          this.processData(data.result);
          this.loading.set(false);
        } else {
          this.error.set('No data received');
          this.loading.set(false);
        }
      },
      error: (err: unknown) => {
        console.error('Error loading class-coupling:', err);
        const message = err instanceof Error ? err.message : 'Error al cargar el acoplamiento de clases';
        this.error.set(message);
        this.loading.set(false);
      }
    });
  }

  ngOnDestroy() {
    if (this.chart) {
      this.chart.destroy();
    }
    if (this.simulation) {
      this.simulation.stop();
    }
  }

  processData(result: any) {
    const nodesMap = new Map<string, NodeData>();
    const links: LinkData[] = [];

    // Collect nodes and links
    for (const file of Object.keys(result)) {
      for (const cls of Object.keys(result[file])) {
        if (!nodesMap.has(cls)) {
          nodesMap.set(cls, { id: cls, fanIn: 0, fanOut: 0 });
        }

        for (const member of result[file][cls]) {
          // Fan-Out
          if (member['fan-out']) {
            for (const targetClass of Object.keys(member['fan-out'])) {
              const target = targetClass;
              const intensity = Object.values(member['fan-out'][targetClass])
                .reduce((a: any, b: any) => a + (b as number), 0);

              if (!nodesMap.has(target)) {
                nodesMap.set(target, { id: target, fanIn: 0, fanOut: 0 });
              }

              // Update coupling counts
              const sourceNode = nodesMap.get(cls)!;
              const targetNode = nodesMap.get(target)!;
              sourceNode.fanOut += intensity as number;
              targetNode.fanIn += intensity as number;

              links.push({
                source: cls,
                target,
                value: intensity as number
              });
            }
          }
        }
      }
    }

    const nodes = Array.from(nodesMap.values());
    this.renderForceGraph(nodes, links);
    this.renderBarChart(nodes);
  }

  renderForceGraph(nodes: NodeData[], links: LinkData[]) {
    const element = this.el.nativeElement.querySelector('#d3Graph');
    if (!element) {
      console.warn('D3 graph element not found');
      return;
    }

    element.innerHTML = ''; // clear before drawing

    const width = element.clientWidth || 800;
    const height = 500;

    const svg = d3.select(element)
      .append('svg')
      .attr('width', '100%')
      .attr('height', height)
      .style('border', '1px solid #ccc')
      .style('background', '#f9f9f9');

    // Create a group for zoom/pan
    const g = svg.append('g');

    this.simulation = d3.forceSimulation(nodes)
      .force('link', d3.forceLink<NodeData, LinkData>(links)
        .id((d: NodeData) => d.id)
        .distance(200)
        .strength(0.5))
      .force('charge', d3.forceManyBody<NodeData>().strength(-400))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collide', d3.forceCollide<NodeData>(30));

    // Zoom behavior
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .on('zoom', (event: d3.D3ZoomEvent<SVGSVGElement, unknown>) => {
        g.attr('transform', event.transform.toString());
      });

    svg.call(zoom);

    // Links
    const link = g.append('g')
      .attr('class', 'links')
      .selectAll('line')
      .data(links)
      .join('line')
      .attr('stroke', '#999')
      .attr('stroke-opacity', 0.6)
      .attr('stroke-width', d => Math.sqrt(d.value) * 2 || 1)
      .attr('marker-end', 'url(#arrowhead)');

    // Arrowhead marker
    svg.append('defs')
      .append('marker')
      .attr('id', 'arrowhead')
      .attr('markerWidth', 10)
      .attr('markerHeight', 10)
      .attr('refX', 20)
      .attr('refY', 3)
      .attr('orient', 'auto')
      .append('polygon')
      .attr('points', '0 0, 10 3, 0 6')
      .attr('fill', '#999');

    // Nodes
    const node = g.append('g')
      .attr('class', 'nodes')
      .selectAll<SVGCircleElement, NodeData>('circle')
      .data(nodes)
      .join('circle')
      .attr('r', (d) => 40 + Math.sqrt(d.fanIn + d.fanOut))
      .attr('fill', (d) => {
        const totalCoupling = d.fanIn + d.fanOut;
        if (totalCoupling > 20) return '#d32f2f'; // Red
        if (totalCoupling > 10) return '#ff6f00'; // Orange
        return '#98aa33ff'; // Green
      })
      .attr('stroke', '#333')
      .attr('stroke-width', 1.5)
      .style('cursor', 'grab')
      .on('mouseenter', function () {
        d3.select<SVGCircleElement, NodeData>(this)
          .transition()
          .duration(200)
          .attr('r', (d: NodeData) => 30 + Math.sqrt((d.fanIn) + d.fanOut))
          .attr('stroke-width', 3);
      })
      .on('mouseleave', function () {
        d3.select<SVGCircleElement, NodeData>(this)
          .transition()
          .duration(200)
          .attr('r', (d: NodeData) => 40 + Math.sqrt(d.fanIn + d.fanOut))
          .attr('stroke-width', 2);
      })
      .call(
        d3.drag<SVGCircleElement, NodeData>()
          .on('start', (event: d3.D3DragEvent<SVGCircleElement, NodeData, NodeData>) =>
            this.dragStarted(event, this.simulation!))
          .on('drag', (event: d3.D3DragEvent<SVGCircleElement, NodeData, NodeData>) =>
            this.dragged(event))
          .on('end', (event: d3.D3DragEvent<SVGCircleElement, NodeData, NodeData>) =>
            this.dragEnded(event, this.simulation!))
      );

    // Labels
    const label = g.append('g')
      .attr('class', 'labels')
      .selectAll<SVGTextElement, NodeData>('text')
      .data(nodes)
      .join('text')
      .text(d => d.id)
      .attr('font-size', 20)
      .attr('text-anchor', 'middle')
      .attr('dy', '.35em')
      .attr('fill', '#333')
      .attr('pointer-events', 'none')
      .style('font-weight', 'bold');

    // Tooltips on hover
    node.append('title')
      .text(d => `${d.id}\nFan-In: ${d.fanIn}\nFan-Out: ${d.fanOut}`);

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

    // Reset zoom button
    svg.append('text')
      .attr('x', 10)
      .attr('y', 25)
      .attr('font-size', 12)
      .attr('fill', '#666')
      .style('cursor', 'pointer')
      .text('Double-click to reset zoom')
      .on('dblclick', () => {
        svg.transition()
          .duration(750)
          .call(zoom.transform as any, d3.zoomIdentity.translate(0, 0));
      });

    // Also reset on double-click anywhere on SVG
    svg.on('dblclick.zoom', () => {
      svg.transition()
        .duration(750)
        .call(zoom.transform as any, d3.zoomIdentity.translate(0, 0));
    });
  }

  private dragStarted(
    event: d3.D3DragEvent<SVGCircleElement, NodeData, NodeData>,
    simulation: d3.Simulation<NodeData, LinkData>
  ) {
    if (!event.active) simulation.alphaTarget(0.3).restart();
    event.subject.fx = event.subject.x;
    event.subject.fy = event.subject.y;
  }

  private dragged(event: d3.D3DragEvent<SVGCircleElement, NodeData, NodeData>) {
    event.subject.fx = event.x;
    event.subject.fy = event.y;
  }

  private dragEnded(
    event: d3.D3DragEvent<SVGCircleElement, NodeData, NodeData>,
    simulation: d3.Simulation<NodeData, LinkData>
  ) {
    if (!event.active) simulation.alphaTarget(0);
    event.subject.fx = null;
    event.subject.fy = null;
  }

  renderBarChart(nodes: NodeData[]) {
    const ctx = this.el.nativeElement.querySelector('#couplingBarChart');
    if (!ctx) {
      console.warn('Bar chart element not found');
      return;
    }

    if (this.chart) {
      this.chart.destroy();
    }

    const labels = nodes.map(n => n.id);
    const fanIn = nodes.map(n => n.fanIn);
    const fanOut = nodes.map(n => n.fanOut);

    this.chart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Fan-In',
            data: fanIn,
            backgroundColor: '#2196F3',
            borderColor: '#1976D2',
            borderWidth: 1,
          },
          {
            label: 'Fan-Out',
            data: fanOut,
            backgroundColor: '#FF9800',
            borderColor: '#F57C00',
            borderWidth: 1,
          }
        ]
      },
      options: {
        plugins: {
          title: {
            display: true,
            text: 'Class Coupling (Fan-In vs Fan-Out)',
            font: { size: 14, weight: 'bold' }
          },
          legend: { position: 'top' }
        },
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: 'y',
        scales: {
          x: { beginAtZero: true, stacked: false }
        }
      }
    });
  }
}