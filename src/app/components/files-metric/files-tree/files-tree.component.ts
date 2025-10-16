// files-tree.component.ts
import {
  Component,
  ElementRef,
  Input,
  OnChanges,
  SimpleChanges,
  ViewChild,
  AfterViewInit,
  OnDestroy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import * as d3 from 'd3';
import { pathsToTree, TreeNode } from './tree.util';

@Component({
  selector: 'files-tree',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './files-tree.component.html',
})
export class FilesTreeComponent implements OnChanges, AfterViewInit, OnDestroy {
  @Input({ required: true }) paths: string[] = [];

  @ViewChild('container', { static: true })
  container!: ElementRef<HTMLDivElement>;

  private svg?: d3.Selection<SVGSVGElement, undefined, null, undefined>;
  private gLink?: d3.Selection<SVGGElement, undefined, null, undefined>;
  private gNode?: d3.Selection<SVGGElement, undefined, null, undefined>;
  private root?: d3.HierarchyNode<TreeNode> & {
    x0?: number;
    y0?: number;
    _children?: d3.HierarchyNode<TreeNode>[];
  };
  private width = 928;
  private margin = { top: 10, right: 10, bottom: 10, left: 40 };
  @Input() dx = 14; // separación vertical
  @Input() initialCollapsedDepth = 1;
  private resizeObs?: ResizeObserver;

  ngAfterViewInit(): void {
    this.render();
    this.resizeObs = new ResizeObserver(() => this.render());
    this.resizeObs.observe(this.container.nativeElement);
  }

  ngOnChanges(_: SimpleChanges): void {
    this.render();
  }

  ngOnDestroy(): void {
    this.resizeObs?.disconnect();
  }

private isRendering = false;

private render() {
  if (!this.container || this.isRendering) return;
  this.isRendering = true;

  try {
    // 1) Medir primero (evita borrar si el contenedor reporta width=0 durante el resize)
    const w = this.container.nativeElement.clientWidth || this.width;
    if (!w || w < 60) return;
    this.width = Math.max(480, w);

    // 2) Recién ahora limpiar
    d3.select(this.container.nativeElement).selectAll('*').remove();

    // 3) Construir árbol desde paths
    const data = pathsToTree(this.paths);

    // ===== Tipos auxiliares =====
type HNode = d3.HierarchyPointNode<TreeNode> & {
  x0: number;
  y0: number;
  id: number; // numeric id used for keys
  _children?: d3.HierarchyNode<TreeNode>[];
};

    // 4) Jerarquía base + layout
    const root0 = d3.hierarchy<TreeNode>(data);
    const dy = (this.width - this.margin.left - this.margin.right) / (1 + root0.height);
    const treeLayout = d3.tree<TreeNode>().nodeSize([this.dx, dy]);

    const diagonal = d3
      .linkHorizontal<d3.HierarchyPointLink<TreeNode>, HNode>()
      .x(d => d.y)
      .y(d => d.x);

    // 5) SVG contenedor con altura inicial visible y viewBox consistente
    const initHeight = Math.max(this.dx * 50, 600);
    this.svg = d3.create('svg') as d3.Selection<SVGSVGElement, undefined, null, undefined>;
    this.svg
      .attr('width', this.width)
      .attr('height', initHeight)
      .attr('viewBox', [-this.margin.left, -this.margin.top, this.width, initHeight] as any)
      .attr('style', 'max-width: 100%; height: auto; font: 11px sans-serif; user-select: none;');

    this.gLink = this.svg.append('g') as d3.Selection<SVGGElement, undefined, null, undefined>;
    this.gLink
      .attr('fill', 'none')
      .attr('stroke', '#555')
      .attr('stroke-opacity', 0.4)
      .attr('stroke-width', 1.55);

    this.gNode = this.svg.append('g') as d3.Selection<SVGGElement, undefined, null, undefined>;
    this.gNode.attr('cursor', 'pointer').attr('pointer-events', 'all');

    // 6) Ejecutar layout y castear a HNode
    const root = treeLayout(root0) as unknown as HNode;

    // 7) Estado inicial
    root.x0 = this.dx / 2;
    root.y0 = 0;
    // Assign incremental ids using a local counter to avoid issues with the typed index parameter
    let __id = 0;
    root.descendants().forEach((d: any) => { (d as any).id = __id++; });

    // Deja expandido hasta initialCollapsedDepth, el resto colapsado
    const maxOpen = Math.max(0, this.initialCollapsedDepth);
    root.descendants().forEach(d => {
      const hd = d as HNode;
      hd._children = d.children as d3.HierarchyNode<TreeNode>[] | undefined;
      if (d.depth > maxOpen) delete (d as any).children; // nunca null
    });

    // 8) Update
    const update = (event: any, source: HNode) => {
      treeLayout(root);

      // límites verticales
      let left: HNode = root, right: HNode = root;
      root.eachBefore((node: any) => {
        const n = node as HNode;
        if (n.x < left.x) left = n;
        if (n.x > right.x) right = n;
      });
      const height = right.x - left.x + this.margin.top + this.margin.bottom;

      const svg = this.svg!;
      const gNode = this.gNode!;
      const gLink = this.gLink!;
      const duration = event?.altKey ? 2500 : 250;

      const transition = svg
        .transition()
        .duration(duration)
        .attr('height', height)
        .attr('viewBox', [-this.margin.left, left.x - this.margin.top, this.width, height] as any);

      // Fallback sin ResizeObserver (opcional)
      if (!(window as any).ResizeObserver) {
        (transition as any).tween('resize', function (this: SVGSVGElement) {
          const sel = d3.select(this);
          return function (_t: number) { sel.dispatch('toggle' as any); };
        });
      }

      const nodes = root.descendants().reverse() as HNode[];
      const links = root.links();

      // tamaño de nodo por #files
      const maxFiles = d3.max(nodes, d => (d.data.isDir ? d.data.fileCount : 1)) || 1;
      const rScale = d3.scaleSqrt().domain([1, maxFiles]).range([2, 10]);

      // NODES
      const nodeSel = gNode
        .selectAll<SVGGElement, HNode>('g')
        .data(nodes, d => (d as HNode).id as number);

      const nodeEnter = nodeSel.enter().append('g')
        .attr('transform', () => `translate(${source.y0},${source.x0})`)
        .attr('fill-opacity', 0)
        .attr('stroke-opacity', 0)
        .on('click', (evt, d: HNode) => {
          if (d.children && d.children.length) {
            d._children = d.children as d3.HierarchyNode<TreeNode>[];
            delete (d as any).children;
          } else {
            d.children = d._children as any;
            d._children = undefined;
          }
          update(evt, d);
        });

      nodeEnter.append('circle')
        .attr('r', d => d.data.isDir ? rScale(Math.max(1, d.data.fileCount)) : 2.5)
        .attr('fill', d => d._children ? '#555' : (d.data.isDir ? '#888' : '#aaa'))
        .attr('stroke-width', 10);

      nodeEnter.append('text')
        .attr('dy', '0.31em')
        .attr('x', d => d._children ? -6 : 6)
        .attr('text-anchor', d => d._children ? 'end' : 'start')
        .text(d => d.data.name + (d.data.isDir ? ` (${d.data.fileCount})` : ''))
        .attr('stroke-linejoin', 'round')
        .attr('stroke-width', 3)
        .attr('stroke', 'white')
        .attr('paint-order', 'stroke');

      nodeSel.merge(nodeEnter as any).transition(transition as any)
        .attr('transform', d => `translate(${d.y},${d.x})`)
        .attr('fill-opacity', 1)
        .attr('stroke-opacity', 1);

      nodeSel.exit().transition(transition as any).remove()
        .attr('transform', () => `translate(${source.y},${source.x})`)
        .attr('fill-opacity', 0)
        .attr('stroke-opacity', 0);

      // LINKS
      const linkSel = gLink
        .selectAll<SVGPathElement, d3.HierarchyPointLink<TreeNode>>('path')
        .data(links, d => (d.target as any).id);

      const linkEnter = linkSel.enter().append('path')
        .attr('d', () => {
          const o = { x: source.x0, y: source.y0 };
          return diagonal({ source: o as any, target: o as any } as any);
        });

      linkSel.merge(linkEnter as any).transition(transition as any)
        .attr('d', diagonal as any);

      linkSel.exit().transition(transition as any).remove()
        .attr('d', () => {
          const o = { x: source.x, y: source.y };
          return diagonal({ source: o as any, target: o as any } as any);
        });

      // stash posiciones
      root.eachBefore((d: any) => {
        const n = d as HNode;
        n.x0 = n.x;
        n.y0 = n.y;
      });
    };

    // 9) Primer render
    update(null, root as HNode);

    // 10) Montar en el DOM
    d3.select(this.container.nativeElement).append(() => this.svg!.node());
  } finally {
    this.isRendering = false;
  }
}

}
