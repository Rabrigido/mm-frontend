import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { Repo } from '../models/repo';
import { ScanResult } from '../models/scan-result';

@Injectable({ providedIn: 'root' })
export class ReposService {
  private http = inject(HttpClient);
  private base = environment.apiBase;

  // Ajusta rutas según tu backend real:
  getRepos() {
    return this.http.get<Repo[]>(`${this.base}/repos`);
  }

  getRepo(id: string) {
    return this.http.get<Repo>(`${this.base}/repos/${id}`);
  }

  // Asumo que agregas un repo pasando gitUrl
  addRepo(gitUrl: string) {
    return this.http.post<Repo>(`${this.base}/repos`, { gitUrl });
  }

  deleteRepo(id: string) {
    return this.http.delete<{ ok: boolean }>(`${this.base}/repos/${id}`);
  }

  // En tus logs vi /repos/:id/scan
  scanRepo(id: string) {
    return this.http.post<ScanResult>(`${this.base}/repos/${id}/scan`, {});
  }
}
