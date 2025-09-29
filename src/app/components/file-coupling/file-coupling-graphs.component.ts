import { Component, ElementRef, Input, OnChanges, SimpleChanges, ViewChild } from '@angular/core';
import * as echarts from 'echarts';
import { FileCouplingResult, buildGraph, topK, buildAdjacency, toSankey, shorten } from '../../utils/file-coupling.util';

@Component({
  selector: 'app-file-coupling-graphs',
  standalone: true,
  template: `
  <div class="grid gap-6" style="grid-template-columns: 1fr;">
    <div #graphEl style="width:100%;height:420px;"></div>
    <div class="grid gap-6 md:grid-cols-2">
      <div #barInEl style="width:100%;height:320px;"></div>
      <div #barOutEl style="width:100%;height:320px;"></div>
    </div>
    <div #heatEl style="width:100%;height:420px;"></div>
    <div #sankeyEl style="width:100%;height:420px;"></div>
  </div>
  `
})
export class FileCouplingGraphsComponent implements OnChanges {
  @Input() data!: { name: string; description: string; result: FileCouplingResult; status: boolean };


  @ViewChild('barInEl', { static: true }) barInEl!: ElementRef<HTMLDivElement>;
  @ViewChild('barOutEl', { static: true }) barOutEl!: ElementRef<HTMLDivElement>;
  @ViewChild('heatEl', { static: true }) heatEl!: ElementRef<HTMLDivElement>;
  @ViewChild('sankeyEl', { static: true }) sankeyEl!: ElementRef<HTMLDivElement>;

  private charts: echarts.ECharts[] = [];

  ngOnChanges(ch: SimpleChanges) {
    if (!this.data?.result) return;
    this.dispose();
    setTimeout(() => this.renderAll(), 0);
    window.addEventListener('resize', this.handleResize);
  }

  private handleResize = () => this.charts.forEach(c => c.resize());

  private dispose() {
    this.charts.forEach(c => c.dispose());
    this.charts = [];
    window.removeEventListener('resize', this.handleResize);
  }

  private renderAll() {
    const fc = this.data.result;
    const { nodes, links, degIn, degOut } = buildGraph(fc);


    // 2) Barras Top-K IN
    {
      const topIn = topK(degIn, 10);
      const chart = echarts.init(this.barInEl.nativeElement);
      this.charts.push(chart);
      chart.setOption({
        title: { text: 'Top fan-in (más referenciados)' },
        tooltip: {},
        grid: { left: 100, right: 20, top: 40, bottom: 40 },
        xAxis: { type: 'value' },
        yAxis: { type: 'category', data: topIn.map(d => d.name), inverse: true },
        series: [{ type: 'bar', data: topIn.map(d => d.value) }]
      });
    }

    // 3) Barras Top-K OUT
    {
      const topOut = topK(degOut, 10);
      const chart = echarts.init(this.barOutEl.nativeElement);
      this.charts.push(chart);
      chart.setOption({
        title: { text: 'Top fan-out (más dependientes)' },
        tooltip: {},
        grid: { left: 100, right: 20, top: 40, bottom: 40 },
        xAxis: { type: 'value' },
        yAxis: { type: 'category', data: topOut.map(d => d.name), inverse: true },
        series: [{ type: 'bar', data: topOut.map(d => d.value) }]
      });
    }

    // 4) Matriz de adyacencia (heatmap)
    {
      const { ids, matrix } = buildAdjacency(fc);
      const data = [];
      for (let i = 0; i < ids.length; i++) {
        for (let j = 0; j < ids.length; j++) {
          if (matrix[i][j] > 0) data.push([i, j, matrix[i][j]]);
        }
      }
      const chart = echarts.init(this.heatEl.nativeElement);
      this.charts.push(chart);
      chart.setOption({
        title: { text: 'Matriz de dependencias (i→j)' },
        tooltip: { position: 'top', formatter: (p: any) => {
          const i = p.value[0], j = p.value[1], v = p.value[2];
          return `${shorten(ids[i])} → ${shorten(ids[j])}: ${v}`;
        }},
        grid: { top: 60, left: 120, right: 20, bottom: 80 },
        xAxis: { type: 'category', data: ids.map(shorten), axisLabel: { rotate: 45 } },
        yAxis: { type: 'category', data: ids.map(shorten), axisLabel: { rotate: 0 } },
        visualMap: [{ min: 0, max: 5, calculable: true, orient: 'horizontal', left: 'center', bottom: 10 }],
        series: [{ type: 'heatmap', data }]
      });
    }

    // 5) Sankey (overview)
    {
      const sankey = toSankey(fc, 6);
      const chart = echarts.init(this.sankeyEl.nativeElement);
      this.charts.push(chart);
      chart.setOption({
        title: { text: 'Flujo de dependencias (Sankey)' },
        tooltip: { trigger: 'item' },
        series: [{
          type: 'sankey',
          data: sankey.nodes,
          links: sankey.links,
          emphasis: {},
          lineStyle: { opacity: 0.4, curveness: 0.5 }
        }]
      });
    }
  }
}
