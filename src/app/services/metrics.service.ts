import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class MetricsService {
  private http = inject(HttpClient);
  private base = environment.apiBase;

  getMetric(repoId: string, metricName: string): Observable<any> {
    return this.http.get<any>(`${this.base}/metrics/${repoId}/${metricName}`);
  }



  getLocSloc(
    repoId: string
  ): Observable<{
    total: { loc: number; sloc: number };
    byFile: Record<string, { loc: number; sloc: number }>;
    fileCount: number;
  }> {
    return this.http.get<{
      total: { loc: number; sloc: number };
      byFile: Record<string, { loc: number; sloc: number }>;
      fileCount: number;
    }>(`${this.base}/metrics/${repoId}/loc-sloc`);
  }

  //getOtrametrica
}
