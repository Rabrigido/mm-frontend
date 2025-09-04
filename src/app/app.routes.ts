import { Routes } from '@angular/router';
import { ReposPageComponent } from './pages/repos-page/repos-page.component';
import { RepoDetailPageComponent } from './pages/repo-detail-page/repo-detail-page.component';

export const routes: Routes = [
  { path: '', redirectTo: 'repos', pathMatch: 'full' },
  { path: 'repos', component: ReposPageComponent },
  { path: 'repos/:id', component: RepoDetailPageComponent },
  { path: '**', redirectTo: 'repos' }
];
