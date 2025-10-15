import {
  Component,
  ElementRef,
  Input,
  OnChanges,
  OnDestroy,
  SimpleChanges,
  ViewChild,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import * as d3 from 'd3';

type TreeNode = {
  name: string; // folder or file name
  path: string; // full path from root
  children?: TreeNode[]; // present for folders when expanded
  _children?: TreeNode[]; // hidden children when collapsed
  isDir: boolean;
  fileCount: number; // number of files in this subtree (1 for files)
};

@Component({
  selector: 'app-files-tree',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './files-tree.component.html',
})
export class FilesTreeComponent implements OnChanges, OnDestroy {
  @Input({ required: true }) paths: string[] = [];
  @Input() height = 640;
  @Input() nodeSize = 28; // separación vertical entre nodos
  @Input() indent = 160; // separación horizontal entre niveles

  @ViewChild('container', { static: true })
  containerRef!: ElementRef<HTMLDivElement>;

  private host = inject(ElementRef) as ElementRef<HTMLElement>;
  private svg?: d3.Selection<SVGSVGElement, unknown, null, undefined>;
  private g?: d3.Selection<SVGGElement, unknown, null, undefined>;
  private linkG?: d3.Selection<SVGGElement, unknown, null, undefined>;
  private nodeG?: d3.Selection<SVGGElement, unknown, null, undefined>;
  private zoom?: d3.ZoomBehavior<SVGSVGElement, unknown>;
  private root?: d3.HierarchyNode<TreeNode> & { x0: number; y0: number };

  ngOnChanges(changes: SimpleChanges): void {
    if ('paths' in changes) {
      this.render();
    }
  }

  ngOnDestroy(): void {
    // Limpia listeners de zoom
    this.svg?.on('.zoom', null as any);
  }

  // ───────────────────────── Build + Render ─────────────────────────
  private render() {
    const el = this.containerRef?.nativeElement;
    if (!el) return;

    // Limpia render previo
    d3.select(el).selectAll('*').remove();

    const width = el.clientWidth || 900;
    const height = this.height;

    // SVG + grupos
    this.svg = d3
      .select(el)
      .append('svg')
      .attr('width', '100%')
      .attr('height', height)
      .attr('viewBox', [0, 0, width, height].join(' '));

    this.g = this.svg.append('g');
    this.linkG = this.g
      .append('g')
      .attr('fill', 'none')
      .attr('stroke', '#cbd5e1')
      .attr('stroke-width', 1.2);
    this.nodeG = this.g.append('g').attr('cursor', 'pointer');

    // Zoom/pan
    this.zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .filter((event: any) => {
        // permitir rueda y arrastre, pero ignorar clicks simples y doble-click
        return (
          event.type === 'wheel' ||
          (event.type === 'mousedown' && event.buttons === 1)
        );
      })
      .scaleExtent([0.4, 2.5])
      .on('zoom', (event) => this.g!.attr('transform', event.transform));

    this.svg.call(this.zoom as any);
    // desactiva zoom con doble click para que el dblclick llegue al nodo si lo usas
    (this.svg as any).on('dblclick.zoom', null);

    // Construye jerarquía
    const treeData = this.buildHierarchy(this.paths);
    this.root = d3.hierarchy<TreeNode>(
      treeData
    ) as d3.HierarchyNode<TreeNode> & { x0: number; y0: number };
    this.root.x0 = this.height / 2;
    this.root.y0 = 0;

let uid = 0;
(this.root as any).each((d: any) => {
  if (d.data) (d.data as any)._uid ??= ++uid; // id estable por data node
});

    // Orden: carpetas primero, luego archivos, y por nombre
    this.root.sort((a, b) => {
      if (a.data.isDir !== b.data.isDir) return a.data.isDir ? -1 : 1;
      return a.data.name.localeCompare(b.data.name);
    });

    // Colapsa a profundidad 1
    this.root.children?.forEach(this.collapseAll);
    // Deja visibles los de nivel 1
    this.expandToDepth(this.root, 1);

    this.update(this.root);
  }

private update(
  source: d3.HierarchyNode<TreeNode> & { x0?: number; y0?: number }
) {
  if (!this.root || !this.nodeG || !this.linkG) return;

  const treeLayout = d3.tree<TreeNode>().nodeSize([this.nodeSize, this.indent]);
  treeLayout(this.root);

  // ⬅️ NUEVO: escala de radio por cantidad de files
  const maxFiles = this.root.data.fileCount || 1;
  const rScale = d3.scaleSqrt().domain([1, Math.max(1, maxFiles)]).range([4, 16]);

  // Links (igual que antes)
const link = this.linkG
  .selectAll<SVGPathElement, d3.HierarchyLink<TreeNode>>('path')
  .data(this.root.links(), (d: any) => d.target?.data?._uid);

const diagonal = d3
  .linkHorizontal<any, any>()
  .x((d: any) => (d?.y ?? 0))
  .y((d: any) => (d?.x ?? 0));

// helper seguro
const safeDiagonal = (d: any, fallback: {x:number;y:number}) => {
  const s = d?.source ?? fallback;
  const t = d?.target ?? fallback;
  return diagonal({ source: s, target: t } as any);
};

link.enter()
  .append('path')
  .attr('d', () => {
    const o = { x: source.x ?? 0, y: source.y ?? 0 };
    return safeDiagonal({ source: o, target: o }, o);
  })
  .merge(link as any)
  .transition()
  .duration(300)
  .attr('d', (d: any) => {
    const o = { x: source.x ?? 0, y: source.y ?? 0 };
    return safeDiagonal(d, o);
  });

link.exit()
  .transition()
  .duration(300)
  .attr('d', () => {
    const o = { x: source.x ?? 0, y: source.y ?? 0 };
    return safeDiagonal({ source: o, target: o }, o);
  })
  .remove();

  // Nodes
  const nodes = this.root.descendants();

const node = this.nodeG
  .selectAll<SVGGElement, any>('g.node')
  .data(nodes, (d: any) => d.data?._uid);

  const nodeEnter = node.enter()
    .append('g')
    .attr('class', 'node')
    .attr('transform', () => `translate(${source.y ?? 0},${source.x ?? 0})`)
    .on('click', (event, d) => {
      event.stopPropagation();
      this.toggle(d);
    });

  // Circle con radio por fileCount
  nodeEnter
    .append('circle')
    .attr('r', 1e-6)
    .attr('fill', (d) =>
      d.data.isDir
        ? (d.children || d.data._children ? '#0ea5e9' : '#38bdf8')
        : '#94a3b8'
    )
    .attr('stroke', (d) => (d.data.isDir ? '#0369a1' : '#64748b'))
    .attr('stroke-width', 1.2);

  // Etiquetas: nombre + (fileCount en carpetas)
  nodeEnter
    .append('text')
    .attr('dy', '0.32em')
    .attr('x', (d) => (d.children || d.data._children ? -10 : 10))
    .attr('text-anchor', (d) => (d.children || d.data._children ? 'end' : 'start'))
    .attr('font-size', 12)
    .text((d) => d.data.isDir ? `${d.data.name} (${d.data.fileCount})` : d.data.name)
    .append('title')
    .text((d) => d.data.path);

  // UPDATE + ENTER
  const nodeMerge = nodeEnter.merge(node as any);

  nodeMerge
    .transition()
    .duration(300)
    .attr('transform', (d: any) => `translate(${d.y},${d.x})`);

  nodeMerge.select('circle')
    .transition()
    .duration(300)
    .attr('r', (d: any) => rScale(Math.max(1, d.data.fileCount)))
    .attr('fill', (d) =>
      d.data.isDir ? (d.data._children ? '#0284c7' : '#38bdf8') : '#94a3b8'
    );

    nodeMerge.select('text')
  .transition()
  .duration(300)
  .attr('x', (d: any) => (d.children || d.data._children ? -10 : 10))
  .attr('text-anchor', (d: any) => (d.children || d.data._children ? 'end' : 'start'))
  .text((d: any) => d.data.isDir ? `${d.data.name} (${d.data.fileCount})` : d.data.name);

  // EXIT
  const nodeExit = node.exit()
    .transition()
    .duration(300)
    .attr('transform', () => `translate(${source.y ?? 0},${source.x ?? 0})`)
    .remove();

  nodeExit.select('circle').attr('r', 1e-6);
  nodeExit.select('text').attr('opacity', 1e-6);

  // Guarda posiciones para animación
  this.root.each((d: any) => {
    d.x0 = d.x;
    d.y0 = d.y;
  });
}


  // ───────────────────────── Interactions ─────────────────────────
  private toggle(d: d3.HierarchyNode<TreeNode>) {
    if (d.children) {
      d.data._children = d.children.map((c) => c.data);
      d.children = undefined; // ⬅️ antes era null
    } else if (d.data._children?.length) {
      d.children = d.data._children.map((c) => d3.hierarchy<TreeNode>(c));
      d.data._children = undefined;
    }
    this.update(d as any);
  }

  private collapseAll = (d: d3.HierarchyNode<TreeNode>) => {
    if (d.children) {
      d.children.forEach(this.collapseAll);
      (d.data as any)._children = d.children.map((c) => c.data);
      d.children = undefined as any; // ⬅️ antes era null
    }
  };

  private expandToDepth(
    node: d3.HierarchyNode<TreeNode>,
    depth: number,
    current = 0
  ) {
    if (current >= depth) return;
    if (node.data._children?.length) {
      node.children = node.data._children.map((c) => d3.hierarchy<TreeNode>(c));
      node.data._children = undefined;
    }
    node.children?.forEach((c) => this.expandToDepth(c, depth, current + 1));
  }

  // ───────────────────────── Hierarchy builder ─────────────────────────
  private buildHierarchy(paths: string[]): TreeNode {
    // Soporta "/" y "\"
    const sepRegex = /[\\/]+/;

    const root: TreeNode = {
      name: '(repo)',
      path: '(repo)', // ⬅️ evitar que sea vacío, D3 usa esto como key
      isDir: true,
      children: [],
      fileCount: 0,
    };

    const dir = (node: TreeNode, name: string, fullPath: string): TreeNode => {
      node.children = node.children ?? [];
      let child = node.children.find((c) => c.name === name && c.isDir);
      if (!child) {
        const path = node.path === '(repo)' ? name : `${node.path}/${name}`;
        child = { name, path, isDir: true, children: [], fileCount: 0 };
        node.children.push(child);
      }
      return child;
    };

    for (const full of paths) {
      if (!full) continue;
      const parts = full.split(sepRegex).filter(Boolean);
      if (parts.length === 0) continue;

      // Separar carpeta/archivo
      const fileName = parts[parts.length - 1];
      let cursor = root;
      let acc = '';
      for (let i = 0; i < parts.length - 1; i++) {
        acc = acc ? `${acc}/${parts[i]}` : parts[i];
        cursor = dir(cursor, parts[i], acc);
      }
      // Hoja archivo
      const fileNode: TreeNode = {
        name: fileName,
        path: full,
        isDir: false,
        fileCount: 1,
      };
      cursor.children = cursor.children ?? [];
      cursor.children.push(fileNode);
    }

    // Propagar conteos de archivos hacia arriba
    const propagate = (n: TreeNode): number => {
      if (!n.isDir) return 1;
      const ch = n.children ?? [];
      const count = ch.reduce((sum, c) => sum + propagate(c), 0);
      n.fileCount = count;
      return count;
    };
    propagate(root);

    return root;
  }
}
