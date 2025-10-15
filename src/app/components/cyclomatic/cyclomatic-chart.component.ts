import { Component, OnInit, Input, inject } from '@angular/core';
import { ChartData, ChartOptions } from 'chart.js';
import { MetricsService } from '../../services/metrics.service';

@Component({
  selector: 'app-cyclomatic-chart',
  template: '<canvas baseChart [data]="chartData" [options]="options" chartType="bar"></canvas>',
})
export class CyclomaticChartComponent implements OnInit {
  private svc = inject(MetricsService);

  @Input({ required: true }) repoId!: string;

  chartData: ChartData<'bar'> = { labels: [], datasets: [{ label: 'Cyclomatic Complexity', data: [], backgroundColor: '#4285F4' }] };
  options: ChartOptions<'bar'> = { responsive: true, plugins: { legend: { display: true } } };

  ngOnInit() {
    this.svc.getCyclomatic(this.repoId).subscribe(data => {
      this.chartData.labels = Object.keys(data.byFile);
      this.chartData.datasets[0].data = Object.values(data.byFile).map((f: any) => f.complexity);
    });
  }
}
