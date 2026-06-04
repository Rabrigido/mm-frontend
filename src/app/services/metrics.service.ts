import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { Observable, map } from 'rxjs';

/** Placeholder DTO — currently unused; metrics return `any` via getMetric(). */
interface MetricsDto {}

/**
 * REST client for fetching individual metric data by repo and metric name.
 * Endpoint: GET /metrics/:repoId/:metricName.
 */
@Injectable({ providedIn: 'root' })
export class MetricsService {
  private http = inject(HttpClient);
  private base = environment.apiBase;
  private stubs = environment.useStubs;

  getMetric(repoId: string, metricName: string): Observable<any> {
    if (this.stubs) {
      return this.http.get<any>('/json/stub-data.json').pipe(
        map(data => data.modularityMetrics[metricName])
      );
    }
    return this.http.get<any>(`${this.base}/metrics/${repoId}/${metricName}`);
  }

}
