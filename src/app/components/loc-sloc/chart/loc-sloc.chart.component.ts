import { Component, OnInit, Input, inject } from '@angular/core';
import { ChartData, ChartOptions } from 'chart.js';
import { MetricsService } from '../../../services/metrics.service';
 

@Component({
  selector: 'app-loc-sloc-chart',
  templateUrl: './loc-sloc-chart.component.html',
})
export class LocSlocChartComponent implements OnInit {
  private svc = inject(MetricsService);

  @Input({ required: true }) repoId!: string;

  chartData: ChartData<'bar'> = {
    labels: [],
    datasets: [
      { label: 'LOC', data: [], backgroundColor: '#4285F4' },
      { label: 'SLOC', data: [], backgroundColor: '#FB8C00' }
    ]
  };

  options: ChartOptions<'bar'> = {
    responsive: true,
    plugins: { legend: { display: true } },
    scales: {
      x: { stacked: true },
      y: { stacked: true }
    }
  };

  ngOnInit() {
    this.svc.getLocSloc(this.repoId).subscribe(data => {
      this.chartData.labels = Object.keys(data.byFile);
      this.chartData.datasets[0].data = Object.values(data.byFile).map((f: any) => f.loc);
      this.chartData.datasets[1].data = Object.values(data.byFile).map((f: any) => f.sloc);
    });
  }
}
