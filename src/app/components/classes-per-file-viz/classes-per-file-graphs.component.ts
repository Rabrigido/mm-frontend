import {
  Component,
  Input,
  ViewChild,
  ElementRef,
  AfterViewInit,
  OnDestroy,
  OnChanges,
  signal,
  computed,
  SimpleChanges,
} from '@angular/core';
import * as d3 from 'd3';

type Mode = 'bar' | 'pie' | 'heatmap' | 'treemap';

type RawMetric = {
  name: string;
  description: string;
  result: Record<string, Record<string, unknown>>;
  status?: boolean;
};

type FileRow = {
  path: string;
  file: string;
  folder: string;
  classes: number;
};

@Component({
  selector: 'app-classes-per-file-graphs',
  standalone: true,
  templateUrl: './classes-per-file-graphs.component.html',
  styleUrls: ['./classes-per-file-graphs.component.css'],
})
export class ClassesPerFileGraphsComponent
  implements AfterViewInit, OnDestroy, OnChanges
{
  @Input() data?: RawMetric;

  @ViewChild('barHost', { static: true }) barHost!: ElementRef<HTMLDivElement>;
  @ViewChild('pieHost', { static: true }) pieHost!: ElementRef<HTMLDivElement>;
  @ViewChild('heatHost', { static: true }) heatHost!: ElementRef<HTMLDivElement>;
  @ViewChild('treeHost', { static: true }) treeHost!: ElementRef<HTMLDivElement>;

  /** Vista activa */
  mode = signal<Mode>('bar');

  /** Controles UX */
  showZeros = signal(false); // Mostrar también archivos con 0 clases
  heatmapOnlyWithClasses = signal(true); // Heatmap solo con archivos que tengan clases

  private resizeObs?: ResizeObserver;

  /** Filas base */
  rows = signal<FileRow[]>([]);

  /** Filas filtradas por showZeros */
  rowsFiltered = computed(() =>
    this.showZeros() ? this.rows() : this.rows().filter((r) => r.classes > 0)
  );

  /** Agrupación por carpeta (usando filtrados) */
  folders = computed(() => {
    const list = this.rowsFiltered();
    const m = new Map<string, FileRow[]>();
    list.forEach((r) => {
      if (!m.has(r.folder)) m.set(r.folder, []);
      m.get(r.folder)!.push(r);
    });
    for (const [, arr] of m) arr.sort((a, b) => a.file.localeCompare(b.file));
    return new Map([...m.entries()].sort(([a], [b]) => a.localeCompare(b)));
  });

  /** Resumen */
  summary = computed(() => {
    const total = this.rows().length;
    const withC = this.rows().filter((r) => r.classes > 0).length;
    const withoutC = total - withC;
    const max = d3.max(this.rows(), (d) => d.classes) ?? 0;
    const maxFiltered = d3.max(this.rowsFiltered(), (d) => d.classes) ?? 0;
    return { total, withC, withoutC, max, maxFiltered };
  });

  ngOnChanges(ch: SimpleChanges) {
    if (ch['data']) this.normalize();
    queueMicrotask(() => this.redraw());
  }

  ngAfterViewInit() {
    this.normalize();
    this.bindResize();
    this.redraw();
  }

  ngOnDestroy(): void {
    this.resizeObs?.disconnect();
  }

  setMode(m: Mode) {
    this.mode.set(m);
    this.redraw();
  }

  // =========================
  // Parsing / Normalization
  // =========================
  private normalize() {
    if (!this.data?.result) {
      this.rows.set([]);
      return;
    }
    const rows: FileRow[] = Object.entries(this.data.result)
      .map(([path, obj]) => {
        const parts = path.split('/');
        const file = parts.at(-1) ?? path;
        // limpia prefijo largo hasta .../data/repos/<id>/
        const folder = parts
          .slice(0, -1)
          .join('/')
          .replace(/.*?\/data\/repos\/[^/]+\//, '');
        const classes = Object.keys(obj || {}).length; // nº de claves top-level = nº clases
        return {
          path,
          file,
          folder: folder || '(root)',
          classes,
        };
      })
      .sort(
        (a, b) =>
          d3.descending(a.classes, b.classes) ||
          a.folder.localeCompare(b.folder) ||
          a.file.localeCompare(b.file)
      );
    this.rows.set(rows);
  }

  // =========================
  // Resize
  // =========================
  private bindResize() {
    this.resizeObs = new ResizeObserver(() => this.redraw());
    // Enlaza a todos los hosts (existen tras AfterViewInit)
    this.resizeObs.observe(this.barHost.nativeElement);
    this.resizeObs.observe(this.pieHost.nativeElement);
    this.resizeObs.observe(this.heatHost.nativeElement);
    this.resizeObs.observe(this.treeHost.nativeElement);
  }

  // =========================
  // Drawing utils
  // =========================
  private clear(el: HTMLElement) {
    el.innerHTML = '';
  }

  private redraw() {
    const mode = this.mode();
    if (mode === 'bar') this.drawBar();
    if (mode === 'pie') this.drawPie();
    if (mode === 'heatmap') this.drawHeatmap();
    if (mode === 'treemap') this.drawTreemap();
  }

  // =========================
  // BAR (horizontal)
  // =========================
  private drawBar() {
    const el = this.barHost.nativeElement;
    this.clear(el);
    const data = this.rowsFiltered();
    if (!data.length) {
      d3.select(el)
        .append('div')
        .attr('class', 'text-sm text-slate-500')
        .text('No hay archivos con clases.');
      return;
    }

    const margin = { top: 20, right: 16, bottom: 24, left: 220 };
    const width = Math.max(520, el.clientWidth);
    const height = Math.max(60, data.length * 22 + margin.top + margin.bottom);

    const svg = d3.select(el).append('svg').attr('width', width).attr('height', height);

    const x = d3
      .scaleLinear()
      .domain([0, d3.max(data, (d) => d.classes)!])
      .nice()
      .range([margin.left, width - margin.right]);

    const y = d3
      .scaleBand()
      .domain(data.map((d) => `${d.folder}/${d.file}`))
      .range([margin.top, height - margin.bottom])
      .padding(0.15);

    const color = d3
      .scaleSequential<number, string>()
      .domain([0, this.summary().maxFiltered || 1])
      .interpolator(d3.interpolateBlues);

    svg
      .append('g')
      .attr('transform', `translate(0,${margin.top})`)
      .call(d3.axisTop(x).ticks(5).tickFormat(d3.format('d')))
      .selectAll('text')
      .style('font-size', '11px');

    svg
      .append('g')
      .attr('transform', `translate(${margin.left},0)`)
      .call(d3.axisLeft(y).tickSize(0))
      .selectAll('text')
      .style('font-size', '11px');

    svg
      .append('g')
      .selectAll('rect')
      .data(data)
      .join('rect')
      .attr('x', x(0))
      .attr('y', (d) => y(`${d.folder}/${d.file}`)!)
      .attr('height', y.bandwidth())
      .attr('width', (d) => x(d.classes) - x(0))
      .attr('rx', 4)
      .attr('fill', (d) => color(d.classes))
      .append('title')
      .text((d) => `${d.folder}/${d.file}\n#clases: ${d.classes}`);

    svg
      .append('g')
      .selectAll('text.value')
      .data(data)
      .join('text')
      .attr('class', 'value')
      .attr('x', (d) => x(d.classes) + 6)
      .attr('y', (d) => y(`${d.folder}/${d.file}`)! + y.bandwidth() / 2 + 4)
      .text((d) => d.classes)
      .style('font-size', '11px')
      .style('fill', '#475569');
  }

  // =========================
  // PIE (con vs sin clases)
  // =========================
  private drawPie() {
    const el = this.pieHost.nativeElement;
    this.clear(el);
    const { withC, withoutC } = this.summary();
    if (withC + withoutC === 0) return;

    const width = Math.max(300, el.clientWidth);
    const height = Math.max(240, el.clientHeight || 240);
    const r = Math.min(width, height) / 2 - 8;

    const svg = d3
      .select(el)
      .append('svg')
      .attr('width', width)
      .attr('height', height)
      .append('g')
      .attr('transform', `translate(${width / 2},${height / 2})`);

    const data = [
      { key: 'Con clases', value: withC },
      { key: 'Sin clases', value: withoutC },
    ].filter((d) => d.value > 0);

    const pie = d3
      .pie<typeof data[number]>()
      .sort(null)
      .value((d) => d.value);

    const arc = d3
      .arc<d3.PieArcDatum<typeof data[number]>>()
      .innerRadius(r * 0.5)
      .outerRadius(r);

    const color = d3
      .scaleOrdinal<string>()
      .domain(data.map((d) => d.key))
      .range(['#3b82f6', '#cbd5e1']);

    svg
      .selectAll('path')
      .data(pie(data))
      .join('path')
      .attr('d', arc as any)
      .attr('fill', (d) => color(d.data.key) as string)
      .append('title')
      .text((d) => `${d.data.key}: ${d.data.value}`);

    // Leyenda
    const legend = svg.append('g').attr('transform', `translate(${-r},${r + 16})`);
    legend
      .selectAll('g')
      .data(data)
      .join('g')
      .attr('transform', (_, i) => `translate(${i * 120},0)`)
      .call((g) => {
        g.append('rect')
          .attr('width', 12)
          .attr('height', 12)
          .attr('rx', 3)
          .attr('fill', (d) => color(d.key) as string);
        g.append('text')
          .attr('x', 16)
          .attr('y', 10)
          .text((d) => `${d.key} (${d.value})`)
          .style('font-size', '12px')
          .style('fill', '#334155');
      });
  }

  // =========================
  // HEATMAP (carpeta x archivo)
  // =========================
  private drawHeatmap() {
    const el = this.heatHost.nativeElement;
    this.clear(el);

    const source = this.heatmapOnlyWithClasses() ? this.rowsFiltered() : this.rows();
    const byFolder = d3.group(source, (d) => d.folder);
    const foldersArr = Array.from(byFolder.keys());
    const filesArr = Array.from(new Set(source.map((r) => r.file)));

    if (!foldersArr.length || !filesArr.length) {
      d3.select(el)
        .append('div')
        .attr('class', 'text-sm text-slate-500')
        .text('No hay datos para heatmap.');
      return;
    }

    const margin = { top: 40, right: 16, bottom: 60, left: 160 };
    const width = Math.max(640, el.clientWidth);
    const cell = 22;
    const height = margin.top + margin.bottom + foldersArr.length * cell;

    const svg = d3.select(el).append('svg').attr('width', width).attr('height', height);

    const x = d3
      .scaleBand()
      .domain(filesArr)
      .range([margin.left, width - margin.right])
      .padding(0.05);

    const y = d3
      .scaleBand()
      .domain(foldersArr)
      .range([margin.top, height - margin.bottom])
      .padding(0.05);

    const max = d3.max(source, (d) => d.classes) ?? 1;
    const color = d3
      .scaleSequential<number, string>()
      .domain([0, max])
      .interpolator(d3.interpolateYlGnBu);

    // Ejes
    svg
      .append('g')
      .attr('transform', `translate(0,${margin.top})`)
      .call(d3.axisTop(x).tickSize(0))
      .selectAll('text')
      .attr('transform', 'rotate(-35)')
      .style('text-anchor', 'start')
      .style('font-size', '10px');

    svg
      .append('g')
      .attr('transform', `translate(${margin.left},0)`)
      .call(d3.axisLeft(y).tickSize(0))
      .selectAll('text')
      .style('font-size', '11px');

    // Mapa (folder|file -> classes)
    const map = new Map<string, number>();
    source.forEach((r) => map.set(`${r.folder}|${r.file}`, r.classes));

    const cells = foldersArr.flatMap((folder) =>
      filesArr.map((file) => ({ folder, file, classes: map.get(`${folder}|${file}`) ?? 0 }))
    );

    svg
      .append('g')
      .selectAll('rect')
      .data(cells)
      .join('rect')
      .attr('x', (d) => x(d.file)!)
      .attr('y', (d) => y(d.folder)!)
      .attr('width', x.bandwidth())
      .attr('height', y.bandwidth())
      .attr('rx', 3)
      .attr('fill', (d) => color(d.classes))
      .append('title')
      .text((d) => `${d.folder}/${d.file}\n#clases: ${d.classes}`);
  }

  // =========================
  // TREEMAP (archivos por carpeta)
  // =========================
  private drawTreemap() {
    const el = this.treeHost.nativeElement;
    this.clear(el);

    const width = Math.max(520, el.clientWidth);
    const height = Math.max(360, 280);

    const byFolder = d3.group(this.rowsFiltered(), (d) => d.folder);
    if (!byFolder.size) {
      d3.select(el)
        .append('div')
        .attr('class', 'text-sm text-slate-500')
        .text('No hay archivos con clases para treemap.');
      return;
    }

    const tree = {
      name: 'root',
      children: Array.from(byFolder, ([folder, items]) => ({
        name: folder,
        children: items.map((it) => ({
          name: it.file,
          value: Math.max(1, it.classes), // asegura área visible
          classes: it.classes,
          full: it.path,
        })),
      })),
    } as any;

    const root = d3
      .hierarchy(tree)
      .sum((d: any) => d.value ?? 0)
      .sort((a, b) => (b.value || 0) - (a.value || 0));
    d3.treemap().size([width, height]).paddingInner(2).round(true)(root as any);

    const max = this.summary().maxFiltered || 1;
    const color = d3
      .scaleSequential<number, string>()
      .domain([0, max])
      .interpolator(d3.interpolatePuBuGn);

    const svg = d3.select(el).append('svg').attr('width', width).attr('height', height);

    const cells = svg
      .append('g')
      .selectAll('g')
      .data(root.leaves())
      .join('g')
      .attr('transform', (d) => {
        const rect = d as d3.HierarchyRectangularNode<any>;
        return `translate(${rect.x0},${rect.y0})`;
      });

    cells
      .append('rect')
      .attr('width', (d) => {
        const rect = d as d3.HierarchyRectangularNode<any>;
        return Math.max(0, rect.x1 - rect.x0);
      })
      .attr('height', (d) => {
        const rect = d as d3.HierarchyRectangularNode<any>;
        return Math.max(0, rect.y1 - rect.y0);
      })
      .attr('rx', 4)
      .attr('fill', (d) => color(d.data.classes ?? 0))
      .append('title')
      .text(
        (d) =>
          `${d.ancestors().at(-2)?.data.name as string}/${d.data.name}\n#clases: ${
            d.data.classes
          }`
      );

    // Etiquetas truncadas
    cells
      .append('text')
      .attr('x', 6)
      .attr('y', 16)
      .text((d) => d.data.name)
      .style('font-size', '11px')
      .style('fill', '#0f172a')
      .each(function (this: SVGTextElement, d: any) {
        const node = d3.select(this);
        const maxW = Math.max(0, d.x1 - d.x0 - 12);
        let text = d.data.name as string;
        while (this.getComputedTextLength() > maxW && text.length > 3) {
          text = text.slice(0, -2) + '…';
          node.text(text);
        }
      });
  }
}
