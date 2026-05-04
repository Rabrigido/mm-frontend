import { Injectable, inject } from '@angular/core';
import { forkJoin, map, Observable, of, catchError } from 'rxjs';
import { MetricsService } from './metrics.service';
import { GraphHierarchyBuilderService } from './graph-hierarchy-builder.service';
import { GraphLinkAggregatorService } from './graph-link-aggregator.service';
import { HierarchicalData } from '../types/graph.types';

// Re-export for backward compatibility
export type { GraphNode, GraphLink, HierarchicalData } from '../types/graph.types';

/**
 * Orchestrates graph data loading and building.
 * Delegates to specialized services:
 * - GraphHierarchyBuilderService: Creates node hierarchy
 * - GraphLinkAggregatorService: Creates and aggregates links
 */
@Injectable({ providedIn: 'root' })
export class GraphDataService {
  private metrics = inject(MetricsService);
  private hierarchyBuilder = inject(GraphHierarchyBuilderService);
  private linkAggregator = inject(GraphLinkAggregatorService);

  loadHierarchy(repoId: string): Observable<HierarchicalData> {
    const req = (name: string) =>
      this.metrics.getMetric(repoId, name).pipe(catchError(() => of({ result: {} })));

    return forkJoin({
      files: req('files'),
      classes: req('classes-per-file'),
      classCoupling: req('class-coupling'),
      funcs: req('functions-per-file'),
      funcCoupling: req('function-coupling'),
    }).pipe(
      map(data => this.buildGraph(data))
    );
  }

  private buildGraph(data: any): HierarchicalData {
    // 1. Build node hierarchy
    const nodesMap = this.hierarchyBuilder.buildHierarchy(data);

    // 2. Build class/method mappings (for link aggregation)
    const classToFilesMap = this.hierarchyBuilder.buildClassesAndMethods(data, nodesMap);

    // 3. Build function mappings (for link aggregation)
    const functionToFileMap = this.hierarchyBuilder.buildStandaloneFunctions(data, nodesMap);

    // 4. Build all links at all hierarchy levels
    const links = this.linkAggregator.buildAllLinks(data, nodesMap, classToFilesMap, functionToFileMap);

    return { nodes: Array.from(nodesMap.values()), links };
  }
}
