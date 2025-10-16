// dependencies-d3.component.ts
import { Component, OnInit, ElementRef, Input, inject } from '@angular/core';
import * as d3 from 'd3';
import { MetricsService } from '../../services/metrics.service';

// Define a proper interface for your nodes
interface NodeDatum extends d3.SimulationNodeDatum {
  id: string;
}

// Define a proper interface for your links
interface LinkDatum extends d3.SimulationLinkDatum<NodeDatum> {
  source: string | NodeDatum;
  target: string | NodeDatum;
}

@Component({
  selector: 'app-dependencies-d3',
  template: '<svg width="900" height="600"></svg>',
})
export class DependenciesD3Component implements OnInit {
  private svc = inject(MetricsService);
  private el = inject(ElementRef);

  @Input({ required: true }) repoId!: string;

  ngOnInit() {
    this.svc.getDependencies(this.repoId).subscribe(data => this.renderGraph(data));
  }

  renderGraph(data: any) {
    const nodes: NodeDatum[] = Object.keys(data.nodes).map(n => ({ id: n }));
    const links: LinkDatum[] = data.links.map((l: any) => ({ source: l.from, target: l.to }));

    const svg = d3.select(this.el.nativeElement).select('svg');
    const width = +svg.attr('width');
    const height = +svg.attr('height');

    const simulation = d3.forceSimulation<NodeDatum>(nodes)
      .force('link', d3.forceLink<NodeDatum, LinkDatum>(links).id(d => d.id).distance(80))
      .force('charge', d3.forceManyBody().strength(-200))
      .force('center', d3.forceCenter(width / 2, height / 2));

    const link = svg.append('g').selectAll('line').data(links).enter()
      .append('line')
      .attr('stroke', '#999');

    const node = svg.append('g').selectAll('circle').data(nodes).enter()
      .append('circle')
      .attr('r', 8)
      .attr('fill', '#4285F4')
      .call(d3.drag<SVGCircleElement, NodeDatum>()
        .on('start', (event, d) => { 
          if (!event.active) simulation.alphaTarget(0.3).restart(); 
          d.fx = event.x; 
          d.fy = event.y; 
        })
        .on('drag', (event, d) => { 
          d.fx = event.x; 
          d.fy = event.y; 
        })
        .on('end', (event, d) => { 
          if (!event.active) simulation.alphaTarget(0); 
          d.fx = null; 
          d.fy = null; 
        })
      );

    simulation.on('tick', () => {
      link.attr('x1', d => (d.source as NodeDatum).x!)
          .attr('y1', d => (d.source as NodeDatum).y!)
          .attr('x2', d => (d.target as NodeDatum).x!)
          .attr('y2', d => (d.target as NodeDatum).y!);

      node.attr('cx', d => d.x!)
          .attr('cy', d => d.y!);
    });
  }
}
