import { Component, OnInit, ElementRef, Input, inject } from '@angular/core';
import * as d3 from 'd3';
import { MetricsService } from '../../services/metrics.service';

@Component({
  selector: 'app-architecture-d3',
  template: '<svg width="900" height="600"></svg>',
})
export class ArchitectureD3Component implements OnInit {
  private svc = inject(MetricsService);
  private el = inject(ElementRef);

  @Input({ required: true }) repoId!: string;

  ngOnInit() {
    this.svc.getArchitecture(this.repoId).subscribe(data => this.renderSunburst(data));
  }

  renderSunburst(data: any) {
    const svg = d3.select(this.el.nativeElement).select('svg');
    const width = +svg.attr('width');
    const radius = width / 2;

    const root = d3.hierarchy(data).sum((d: any) => d.size);
    d3.partition().size([2 * Math.PI, radius])(root);

    const arc = d3.arc()
      .startAngle((d: any) => d.x0)
      .endAngle((d: any) => d.x1)
      .innerRadius((d: any) => d.y0)
      .outerRadius((d: any) => d.y1);

    svg.attr('viewBox', `0 0 ${width} ${width}`)
      .append('g')
      .attr('transform', `translate(${radius},${radius})`)
      .selectAll('path')
      .data(root.descendants())
      .enter()
      .append('path')
      .attr('d', arc as any)
      .attr('fill', (d: any) => d.children ? '#4285F4' : '#FB8C00')
      .append('title')
      .text((d: any) => `${d.data.name}\n${d.value}`);
  }
}
