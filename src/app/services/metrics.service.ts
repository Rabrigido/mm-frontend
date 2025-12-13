import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { Observable } from 'rxjs';

interface MetricsDto{
  

}

@Injectable({ providedIn: 'root' })
export class MetricsService {
  private http = inject(HttpClient);
  private base = environment.apiBase;


  getMetric(repoId: string, metricName: string): Observable<any> {
    return this.http.get<any>(`${this.base}/metrics/${repoId}/${metricName}`);
   
  }

 
 
 

}
