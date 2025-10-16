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


  getDuplication(repoId: string): Observable<any> {
    return this.http.get<any>(`${this.base}/${repoId}/duplication`);
  }

  getDependencies(repoId: string): Observable<any> {
    return this.http.get<any>(`${this.base}/${repoId}/dependencies`);
  }

  getArchitecture(repoId: string): Observable<any> {
    return this.http.get<any>(`${this.base}/${repoId}/architecture`);
  }

  getClassCoupling(repoId: string): Observable<any> {
    return this.http.get<any>(`${this.base}/metrics/${repoId}/class-coupling`);
  }

  // src/app/services/metrics.service.ts
  getCyclomatic(repoId: string): Observable<{
    name: string;
    description: string;
    total: number;
    byFile: Record<string, { complexity: number }>;
    fileCount: number;
    average:number;
  }> {
    return this.http.get<{
      name: string;
      description: string;
      total: number;
      byFile: Record<string, { complexity: number }>;
      fileCount: number;
      average:number
    }>(`${this.base}/metrics/${repoId}/cyclomatic`);
  }


}
