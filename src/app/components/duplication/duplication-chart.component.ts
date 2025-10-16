// duplication-chart.component.ts
import { Component, OnInit, Input, inject } from '@angular/core';
import { ChartData, ChartOptions } from 'chart.js';
import { MetricsService } from '../../services/metrics.service';

@Component({
  selector: 'app-duplication-chart',
  template: '<canvas baseChart [data]="chartData" [options]="options" chartType="pie"></canvas>',
})
export class DuplicationChartComponent implements OnInit {
  private svc = inject(MetricsService);

  @Input({ required: true }) repoId!: string;

  chartData: ChartData<'pie'> = { labels: [], datasets: [{ label: 'Duplicación', data: [], backgroundColor: [] }] };
  options: ChartOptions<'pie'> = { responsive: true };

  ngOnInit() {
    this.svc.getDuplication(this.repoId).subscribe(data => {
      this.chartData.labels = Object.keys(data.byModule);
      this.chartData.datasets[0].data = Object.values(data.byModule).map((f: any) => f.duplication);
      this.chartData.datasets[0].backgroundColor = Object.keys(data.byModule).map((_, i) => `hsl(${i * 40 % 360},70%,50%)`);
    });
  }
}
