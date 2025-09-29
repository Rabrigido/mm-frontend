import { CommonModule } from '@angular/common';
// files-metric-graphs.component.ts
import {
  Component,
  Input,
  OnChanges,
  SimpleChanges,
  ElementRef,
  ViewChild,
  AfterViewInit,
  OnDestroy,
  signal,
  computed,
} from '@angular/core';
import * as d3 from 'd3';
import { Observable, Subscription } from 'rxjs';

type FilesMode = 'byExtension' | 'byFolder' | 'treemap' | 'depth';

@Component({
  selector: 'app-files-metric-graphs',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './files-metric-graphs.component.html',
  styleUrls: ['./files-metric-graphs.component.css'],
})
export class FilesMetricGraphsComponent implements OnChanges, AfterViewInit, OnDestroy {
  @Input() data: any;
  @Input() loader?: () => Observable<string[]>; // 👈 soporta puntero tipo "../../../../files"

  @ViewChild('chartHost', { static: true }) chartHost!: ElementRef<HTMLDivElement>;

  mode = signal<FilesMode>('byExtension');
  files = signal<string[]>([]);
  hasData = computed(() => this.files().length > 0);

  private resizeObs?: ResizeObserver;
  private sub?: Subscription;

  // ---------------- Ciclo de vida ----------------
  ngAfterViewInit() {
    this.normalizeData();
    this.safeDraw();
    this.bindResize();
  }

  ngOnChanges(changes: SimpleChanges) {
    if ('data' in changes) {
      this.normalizeData();
      this.safeDraw();
    }
  }

  ngOnDestroy(): void {
    if (this.resizeObs) this.resizeObs.disconnect();
    if (this.sub) this.sub.unsubscribe();
    this.clear();
  }

  // ---------------- API ----------------
  setMode(m: FilesMode | string) {
    const allowed: FilesMode[] = ['byExtension', 'byFolder', 'treemap', 'depth'];
    const safe = allowed.includes(m as FilesMode) ? (m as FilesMode) : 'byExtension';
    this.mode.set(safe);
    this.safeDraw();
  }

  /** Acepta: array directo, {result}, {data}, {value}, estructuras anidadas comunes,
   *  o un puntero string (p.ej. "../../../../files") si viene `loader`. */
  private normalizeData() {
    const collect = (d: any): string[] => {
      if (!d) return [];
      if (Array.isArray(d)) return d;
      if (Array.isArray(d.result)) return d.result;
      if (Array.isArray(d.data)) return d.data;
      if (Array.isArray(d?.value)) return d.value;
      if (d.metric && Array.isArray(d.metric.result)) return d.metric.result;
      if (d.payload && Array.isArray(d.payload.result)) return d.payload.result;
      return [];
    };

    // 1) Intento directo
    const direct = collect(this.data).filter((x: any) => typeof x === 'string');
    if (direct.length) {
      this.files.set(direct);
      return;
    }

    // 2) Puntero + loader
    if (typeof this.data === 'string' && this.loader) {
      if (this.sub) this.sub.unsubscribe();
      this.sub = this.loader().subscribe({
        next: (list) => {
          this.files.set((list ?? []).filter((x) => typeof x === 'string'));
          this.safeDraw();
        },
        error: () => {
          this.files.set([]);
          this.safeDraw();
        },
      });
      return;
    }

    // 3) Nada válido
    this.files.set([]);
  }

  private bindResize() {
    if (!this.chartHost?.nativeElement) return;
    this.resizeObs = new ResizeObserver(() => this.safeDraw());
    this.resizeObs.observe(this.chartHost.nativeElement);
  }

  private clear() {
    const host = this.chartHost?.nativeElement;
    if (!host) return;
    host.innerHTML = '';
  }

  /** Dibuja tras el siguiente frame para evitar ancho/alto 0 al montar */
  private safeDraw() {
    requestAnimationFrame(() => {
      queueMicrotask(() => this.draw());
    });
  }

  // ---------------- Dibujo ----------------
  private draw() {
    this.clear();
    if (!this.hasData()) {
      const host = this.chartHost.nativeElement;
      const el = document.createElement('div');
      el.className = 'text-sm text-gray-500';
      el.textContent = 'No hay datos para mostrar.';
      host.appendChild(el);
      return;
    }

    const mode = this.mode();
    switch (mode) {
      case 'byExtension': return this.drawByExtension();
      case 'byFolder':    return this.drawByFolderTop();
      case 'treemap':     return this.drawTreemap();
      case 'depth':       return this.drawDepthHistogram();
    }
  }

  // Util: tamaño
  private size() {
    const host = this.chartHost.nativeElement;
    const width = Math.max(320, host.clientWidth || host.getBoundingClientRect().width || 640);
    const height = Math.max(260, host.clientHeight || host.getBoundingClientRect().height || 360);
    return { width, height, margin: { top: 24, right: 16, bottom: 64, left: 40 } };
  }

  private makeSVG(width: number, height: number) {
    const host = this.chartHost.nativeElement;
    const svg = d3.select(host)
      .append('svg')
      .attr('viewBox', `0 0 ${width} ${height}`)
      .attr('width', '100%')
      .attr('height', '100%')
      .style('display', 'block');
    return svg;
  }

  // ====== 1) Barras por extensión ======
  private drawByExtension() {
    const files = this.files();
    const counts = new Map<string, number>();
    for (const p of files) {
      const m = p.match(/\.([a-z0-9]+)$/i);
      const ext = (m?.[1]?.toLowerCase() || 'sin_ext');
      counts.set(ext, (counts.get(ext) ?? 0) + 1);
    }
    const data = Array.from(counts, ([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 20);

    const { width, height, margin } = this.size();
    const svg = this.makeSVG(width, height);
    const innerW = width - margin.left - margin.right;
    const innerH = height - margin.top - margin.bottom;

    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    const x = d3.scaleBand().domain(data.map(d => d.name)).range([0, innerW]).padding(0.15);
    const y = d3.scaleLinear().domain([0, d3.max(data, d => d.value)!]).nice().range([innerH, 0]);

    g.append('g')
      .attr('transform', `translate(0,${innerH})`)
      .call(d3.axisBottom(x).tickSizeOuter(0))
      .selectAll('text')
      .style('font-size', '10px')
      .attr('transform', 'rotate(45)')
      .style('text-anchor', 'start');

    g.append('g').call(d3.axisLeft(y).ticks(5));

    g.selectAll('rect.bar')
      .data(data).enter().append('rect')
      .attr('class', 'bar')
      .attr('x', d => x(d.name)!)
      .attr('y', d => y(d.value))
      .attr('width', d => x.bandwidth())
      .attr('height', d => innerH - y(d.value))
      .append('title').text(d => `${d.name}: ${d.value}`);
  }

  // ====== 2) Barras por carpeta (Top 20) ======
  private drawByFolderTop() {
    const files = this.files();
    const bucket = new Map<string, number>();
    for (const p0 of files) {
      const p = p0.replace(/\\/g, '/');
      const dir = p.split('/').slice(0, -1).join('/') || '/';
      bucket.set(dir, (bucket.get(dir) ?? 0) + 1);
    }
    const data = Array.from(bucket, ([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 20);

    const { width, height, margin } = this.size();
    const svg = this.makeSVG(width, height);
    const innerW = width - margin.left - margin.right;
    const innerH = height - margin.top - margin.bottom;

    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    const x = d3.scaleBand().domain(data.map(d => d.name)).range([0, innerW]).padding(0.15);
    const y = d3.scaleLinear().domain([0, d3.max(data, d => d.value)!]).nice().range([innerH, 0]);

    g.append('g')
      .attr('transform', `translate(0,${innerH})`)
      .call(d3.axisBottom(x).tickSizeOuter(0))
      .selectAll('text')
      .style('font-size', '10px')
      .attr('transform', 'rotate(60)')
      .style('text-anchor', 'start');

    g.append('g').call(d3.axisLeft(y).ticks(5));

    g.selectAll('rect.bar')
      .data(data).enter().append('rect')
      .attr('class', 'bar')
      .attr('x', d => x(d.name)!)
      .attr('y', d => y(d.value))
      .attr('width', d => x.bandwidth())
      .attr('height', d => innerH - y(d.value))
      .append('title').text(d => `${d.name}: ${d.value}`);
  }

  // ====== 3) Treemap por carpetas ======
  private drawTreemap() {
    const files = this.files();
    const root: any = { name: 'root', children: [], value: 0 };
    const mapNode = new Map<string, any>([['', root]]);
    for (const p0 of files) {
      const parts = p0.replace(/\\/g, '/').split('/').filter(Boolean);
      let path = '';
      let parent = root;
      for (let i = 0; i < parts.length; i++) {
        path = path ? `${path}/${parts[i]}` : parts[i];
        if (!mapNode.has(path)) {
          const node = { name: parts[i], children: [], value: 0 };
          parent.children.push(node);
          mapNode.set(path, node);
        }
        parent = mapNode.get(path);
        if (i === parts.length - 1) parent.value = (parent.value ?? 0) + 1;
      }
    }
    const d3root = d3.hierarchy(root)
      .sum((d: any) => d.value || 0)
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

    const { width, height } = this.size();
    const svg = this.makeSVG(width, height);

    d3.treemap<any>().size([width, height]).paddingInner(2)(d3root);

    const color = d3.scaleOrdinal(d3.schemeTableau10);

    const nodes = svg.selectAll('g.node')
      .data(d3root.leaves())
      .enter()
      .append('g')
      .attr('transform', (d: any) => `translate(${d.x0},${d.y0})`);

    nodes.append('rect')
      .attr('width', (d: any) => Math.max(0, d.x1 - d.x0))
      .attr('height', (d: any) => Math.max(0, d.y1 - d.y0))
      .attr('fill', (d: any) => color(d.parent?.data?.name ?? 'x') as string)
      .append('title')
      .text((d: any) => `${d.ancestors().map((a: any) => a.data.name).reverse().join('/')} • ${d.value}`);

    nodes.append('text')
      .attr('x', 4)
      .attr('y', 14)
      .style('font-size', '11px')
      .style('pointer-events', 'none')
      .text((d: any) => {
        const w = d.x1 - d.x0;
        const text = d.data.name;
        return w > 60 ? text : '';
      });
  }

  // ====== 4) Histograma de profundidad ======
  private drawDepthHistogram() {
    const files = this.files();
    const depths = files.map(p => {
      const parts = p.replace(/\\/g, '/').split('/').filter(Boolean);
      return Math.max(0, parts.length - 1);
    });

    const maxD = d3.max(depths) ?? 0;
    const buckets = Math.min(15, maxD + 1);
    const bins = new Array(buckets).fill(0);
    for (const d of depths) {
      const idx = Math.min(buckets - 1, d);
      bins[idx]++;
    }

    const data = bins.map((v, i) => ({ name: `${i}`, value: v }));

    const { width, height, margin } = this.size();
    const svg = this.makeSVG(width, height);
    const innerW = width - margin.left - margin.right;
    const innerH = height - margin.top - margin.bottom;

    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    const x = d3.scaleBand().domain(data.map(d => d.name)).range([0, innerW]).padding(0.15);
    const y = d3.scaleLinear().domain([0, d3.max(data, d => d.value)!]).nice().range([innerH, 0]);

    g.append('g').attr('transform', `translate(0,${innerH})`).call(d3.axisBottom(x).tickSizeOuter(0));
    g.append('g').call(d3.axisLeft(y).ticks(5));

    g.selectAll('rect.bar')
      .data(data).enter().append('rect')
      .attr('x', d => x(d.name)!)
      .attr('y', d => y(d.value))
      .attr('width', x.bandwidth())
      .attr('height', d => innerH - y(d.value))
      .append('title').text(d => `Profundidad ${d.name}: ${d.value} archivos`);
  }
}
