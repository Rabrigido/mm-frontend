import {
  AfterViewInit,
  Component,
  DestroyRef,
  ElementRef,
  Input,
  OnChanges,
  SimpleChanges,
  ViewChild,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import * as d3 from 'd3';

type FanRecord = Record<string, number>;

type FCFunction = {
  type: string;
  ['fan-in']?: FanRecord;
  ['fan-out']?: FanRecord;
};

type FCFileEntry = Record<string, FCFunction>;

export type FunctionCouplingResult = Record<string, FCFileEntry>;

/** Opcional: para ayudar a desambiguar nombres repetidos por archivo */
export type FunctionsPerFile = Record<
  string, // file path
  Record<
    string, // function name
    any
  >
>;

type BundleNode = {
  name: string;   // id corto: foo, bar, etc.
  size: number;   // usamos fan-in + fan-out como proxy de importancia
  imports: string[]; // ids completos de destino (se completan luego)
};

@Component({
  selector: 'function-coupling-d3',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './radial-coupling.component.html',
styles: [`
  :host {
    display: block;
  }

  .chart-wrap {
    width: 100%;
    display: flex;
    justify-content: center;   /* centra horizontalmente el SVG */
    align-items: center;       /* centra verticalmente si hay espacio */
    overflow: visible;         /* evita que se corten los textos */
    padding: 0;             /* respeta el px-5 del template */
  }

  svg {
    display: block;
    max-width: 100%;
    height: auto;
    overflow: visible;         /* importante para que se vean las etiquetas */
    font: 11px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
  }

  text {
    cursor: default;
    fill: #999;
  }

  text.bold {
    font-weight: 700;
    fill: #111;
  }

  path.link {
    mix-blend-mode: multiply;
    opacity: .6;
  }
`],




})
export class FunctionCouplingD3Component implements AfterViewInit, OnChanges {
  @Input({ required: true }) data!: FunctionCouplingResult;   // result del metric
  @Input() functionsPerFile?: FunctionsPerFile;               // opcional
  @Input() width = 960;
  @Input() padding = 100; // margen interno del radio

  @ViewChild('container', { static: true }) container!: ElementRef<HTMLDivElement>;

  private destroyRef = inject(DestroyRef);
  private svg?: d3.Selection<SVGSVGElement, undefined, null, undefined>;

  ngAfterViewInit(): void {
    this.render();
    // Redibuja simple on resize
    const ro = new ResizeObserver(() => this.render());
    ro.observe(this.container.nativeElement);
    this.destroyRef.onDestroy(() => ro.disconnect());
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (this.container) this.render();
  }

private render() {
  if (!this.data) return;

  const host = this.container.nativeElement;
  d3.select(host).selectAll('*').remove();

  const w = Math.max(520, Math.min(this.width, host.clientWidth || this.width));
  const radius = w / 2;
  // evita radio negativo si el padding es grande
  const innerR = Math.max(20, radius - this.padding);

  // —— Preparar nodos hoja a partir del result ——
  const fullId = (file: string, func: string) => `${file}::${func}`;

  const nodesByFullId = new Map<string, BundleNode>();
  const indexByShortName = new Map<string, string[]>();

  // si el objeto está vacío, nodesByFullId quedará vacío (lo manejaremos abajo)
  for (const [file, fnMap] of Object.entries(this.data || {})) {
    for (const [fn, rec] of Object.entries(fnMap || {})) {
      const fi = rec?.['fan-in'] ?? {};
      const fo = rec?.['fan-out'] ?? {};
      const size =
        Object.values(fi).reduce((a, b) => a + b, 0) +
        Object.values(fo).reduce((a, b) => a + b, 0);
      const id = fullId(file, fn);

      nodesByFullId.set(id, {
        name: fn,
        size: Math.max(1, size),
        imports: [],
      });

      const arr = indexByShortName.get(fn) ?? [];
      arr.push(id);
      indexByShortName.set(fn, arr);
    }
  }

  for (const [file, fnMap] of Object.entries(this.data || {})) {
    for (const [fn, rec] of Object.entries(fnMap || {})) {
      const id = fullId(file, fn);
      const node = nodesByFullId.get(id);
      if (!node) continue; // seguridad
      const fo = rec?.['fan-out'] ?? {};
      for (const calleeName of Object.keys(fo)) {
        const candidates = indexByShortName.get(calleeName) ?? [];
        node.imports.push(...this.prioritizeCandidates(candidates, file));
      }
    }
  }

  const delimiter = '.';
  const records: Array<{ name: string; size: number; imports: string[] }> = [];

  for (const [fid, node] of nodesByFullId.entries()) {
    const { ns } = this.fullIdToNamespace(fid);
    const dotted = (ns.length ? ns.join(delimiter) + delimiter : '') + node.name;
    const importDots = node.imports.map((dst) => {
      const { ns: ns2 } = this.fullIdToNamespace(dst);
      const dstShort = nodesByFullId.get(dst)?.name ?? this.shortFromFull(dst);
      return (ns2.length ? ns2.join(delimiter) + delimiter : '') + dstShort;
    });
    records.push({ name: dotted, size: node.size, imports: importDots });
  }

  // ▶️ SIN DATOS: mostrar estado vacío y salir
  if (records.length === 0) {
    const emptySvg = d3
      .create('svg')
      .attr('width', w)
      .attr('height', 120)
      .attr('viewBox', `0 0 ${w} 120`);

    emptySvg
      .append('text')
      .attr('x', w / 2)
      .attr('y', 65)
      .attr('text-anchor', 'middle')
      .attr('font-size', 14)
      .attr('fill', '#666')
      .text('Sin datos de acoplamiento de funciones');

    host.appendChild(emptySvg.node()!);
    return;
  }

  // Helpers: hierarchy + bilink + id
  function hierarchy(dataArr: any[], delim = '.') {
    let root: any;
    const map = new Map<string, any>();
    dataArr.forEach(function find(d) {
      const name = d.name;
      if (map.has(name)) return map.get(name);
      const i = name.lastIndexOf(delim);
      map.set(name, d);
      if (i >= 0) {
        const parentName = name.substring(0, i);
        const parent = find({ name: parentName, children: [] as any[] });
        (parent.children as any[]).push(d);
        d.name = name.substring(i + 1);
      } else {
        root = d;
      }
      return d;
    });
    // fallback por si algo raro pasó
    return root ?? { name: 'root', children: [] };
  }

  function id(node: any): string {
    return `${node.parent ? id(node.parent) + '.' : ''}${node.data.name}`;
  }

  function bilink(root: any) {
    const leaves = root.leaves();
    const map = new Map(leaves.map((d: any) => [id(d), d]));
    for (const d of leaves) {
      d.incoming = [];
      d.outgoing = (d.data.imports || [])
        .map((i: string) => [d, map.get(i)])
        .filter(([, tgt]: [any, any | undefined]) => !!tgt); // elimina destinos inexistentes
    }
    for (const d of leaves) for (const o of d.outgoing) o[1].incoming.push(o);
    return root;
  }

  // Construcción segura de root
  const dataRoot = hierarchy(records);
  const cluster = d3.cluster<any>().size([2 * Math.PI, innerR]);
  const root = cluster(
    bilink(
      d3
        .hierarchy(dataRoot)
        .sum((d: any) => d.size || 1)
        .sort(
          (a, b) =>
            d3.ascending(a.height, b.height) ||
            d3.ascending(a.data.name, b.data.name)
        )
    )
  );

  const labelPad =
  Math.min(180, Math.max(
    60,
    d3.max(root.leaves(), (d: any) => (d.data.name?.length || 0))! * 5 // aprox 5px por caracter
  ));

  // —— SVG
const svg = (this.svg = d3
  .create('svg')
  .attr('width', w)
  .attr('height', w)
  // 🔸 amplia el viewBox para que entren los textos a izquierda/derecha/arriba/abajo
  .attr('viewBox', [-(w / 2 + labelPad), -(w / 2 + labelPad), w + 2 * labelPad, w + 2 * labelPad] as any)
  // 🔸 centra el contenido dentro del viewBox
  .attr('preserveAspectRatio', 'xMidYMid meet')
  .attr('aria-label', 'Function Coupling — Radial Edge Bundling'));

  const g = svg.append('g');

  const line = d3
    .lineRadial<any>()
    .curve(d3.curveBundle.beta(0.85))
    .radius((d: any) => d.y)
    .angle((d: any) => d.x);

const link = g
  .append('g')
  .attr('fill', 'none')
  .attr('stroke', '#bbb')
  .attr('stroke-opacity', 0.6)
  .attr('class', 'links')
  .selectAll('path')
  .data(root.leaves().flatMap((leaf: any) => leaf.outgoing))
  .join('path')
  .attr('class', 'link')
  .attr('d', ([from, to]) => (to ? line((from as any).path(to)) : ''))
  .each(function (d: any) {
    // 👈 guarda la referencia al path para usarla en hover
    d.path = this as SVGPathElement;
  });

  const leaf = g
    .append('g')
    .attr('class', 'leaves')
    .selectAll('g')
    .data(root.leaves())
    .join('g')
    .attr('transform', (d: any) => `rotate(${(d.x * 180) / Math.PI - 90}) translate(${d.y},0)`);

  leaf
    .append('text')
    .attr('dy', '0.31em')
    .attr('x', (d: any) => (d.x < Math.PI ? 6 : -6))
    .attr('text-anchor', (d: any) => (d.x < Math.PI ? 'start' : 'end'))
    .attr('transform', (d: any) => (d.x >= Math.PI ? 'rotate(180)' : null))
    .text((d: any) => d.data.name)
    .each(function (d: any) {
      d.text = this;
    })
    .append('title')
    .text(
      (d: any) =>
        `${id(d)}
${d.outgoing.length} outgoing
${d.incoming.length} incoming`
    );

  const colorIn = '#0ea5e9';
  const colorOut = '#10b981';

  function overed(this: any, _event: any, d: any) {
    link.style('mix-blend-mode', null);
    d3.select(this).classed('bold', true);
    d3.selectAll(d.incoming.map((d: any) => d.path)).attr('stroke', colorIn).attr('stroke-width', 1.3).raise();
    d3.selectAll(d.incoming.map(([d]: any) => d.text)).classed('bold', true).attr('fill', '#111');
    d3.selectAll(d.outgoing.map((d: any) => d.path)).attr('stroke', colorOut).attr('stroke-width', 1.3).raise();
    d3.selectAll(d.outgoing.map(([, d]: any) => d.text)).classed('bold', true).attr('fill', '#111');
  }

  function outed(this: any, _event: any, d: any) {
    link.style('mix-blend-mode', 'multiply');
    d3.select(this).classed('bold', false);
    d3.selectAll(d.incoming.map((d: any) => d.path)).attr('stroke', null).attr('stroke-width', null);
    d3.selectAll(d.incoming.map(([d]: any) => d.text)).classed('bold', false).attr('fill', null);
    d3.selectAll(d.outgoing.map((d: any) => d.path)).attr('stroke', null).attr('stroke-width', null);
    d3.selectAll(d.outgoing.map(([, d]: any) => d.text)).classed('bold', false).attr('fill', null);
  }

  leaf.selectAll('text').on('mouseover', overed).on('mouseout', outed);

  // cache de path para el bundling
  /*
  const _linkRadial = d3.linkRadial().angle((p: any) => p.x).radius((p: any) => p.y);
  for (const d of root.leaves()) {
    (d as any).path = (o: any) =>
      _linkRadial({
        source: { x: (d as any).x, y: (d as any).y },
        target: { x: (o as any).x, y: (o as any).y },
      } as any);
  }*/

  host.appendChild(svg.node()!);
}


  /** Si hay varios candidatos con el mismo nombre, prioriza:
   * 1) mismo archivo (mismo file path exacto)
   * 2) misma carpeta base
   * 3) todos los demás (por si acaso)
   */
  private prioritizeCandidates(candidates: string[], currentFile: string): string[] {
    if (candidates.length <= 1) return candidates;
    const baseDir = currentFile.substring(0, currentFile.lastIndexOf('/'));
    const sameFile = candidates.filter((c) => c.startsWith(currentFile + '::'));
    const sameDir = candidates.filter((c) => !sameFile.includes(c) && c.startsWith(baseDir));
    const others = candidates.filter((c) => !sameFile.includes(c) && !sameDir.includes(c));
    return [...sameFile, ...sameDir, ...others];
  }

  private fullIdToNamespace(fid: string): { ns: string[]; short: string } {
    // full id: "/path/to/file.ts::funcName"
    const [file, _fn] = fid.split('::');
    const parts = file
      .replaceAll('\\', '/')
      .split('/')
      .filter(Boolean);
    // eliminar extensión del último
    if (parts.length) {
      const last = parts[parts.length - 1];
      const dot = last.lastIndexOf('.');
      if (dot > 0) parts[parts.length - 1] = last.substring(0, dot);
    }
    return { ns: ['root', ...parts], short: _fn };
  }

  private shortFromFull(fid: string): string {
    const ix = fid.lastIndexOf('::');
    return ix >= 0 ? fid.substring(ix + 2) : fid;
  }
}
