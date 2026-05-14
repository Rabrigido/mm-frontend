import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { Repo } from '../models/repo';
import { ScanResult } from '../models/scan-result';
import { map, of } from 'rxjs';

/**
 * REST client for repository CRUD and scan operations.
 * Endpoints: GET/POST/DELETE /repos, POST /repos/:id/scan.
 */
@Injectable({ providedIn: 'root' })
export class ReposService {
  private http = inject(HttpClient);
  private base = environment.apiBase;
  private stubs = environment.useStubs;

  getRepos() {
    if (this.stubs) {
      return this.http.get<any>('/json/stub-data.json').pipe(
        map(data => data.repos as Repo[])
      );
    }
    return this.http.get<Repo[]>(`${this.base}/repos`);
  }

  getRepo(id: string) {
    if (this.stubs) {
      return this.http.get<any>('/json/stub-data.json').pipe(
        map(data => (data.repos as Repo[]).find(r => r.id === id)!)
      );
    }
    return this.http.get<Repo>(`${this.base}/repos/${id}`);
  }

  addRepo(gitUrl: string) {
    if (this.stubs) {
      return this.http.get<any>('/json/stub-data.json').pipe(
        map(data => (data.repos as Repo[])[0])
      );
    }
    return this.http.post<Repo>(`${this.base}/repos`, { gitUrl });
  }

  deleteRepo(id: string) {
    if (this.stubs) return of({ ok: true });
    return this.http.delete<{ ok: boolean }>(`${this.base}/repos/${id}`);
  }

  scanRepo(id: string) {
    if (this.stubs) {
      return this.http.get<any>('/json/stub-data.json').pipe(
        map(data => data.scanResult as ScanResult)
      );
    }
    return this.http.post<ScanResult>(`${this.base}/repos/${id}/scan`, {});
  }
}
