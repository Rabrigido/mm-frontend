import { Injectable, inject } from '@angular/core';
import { forkJoin, map, Observable, of, catchError } from 'rxjs';
import { MetricsService } from './metrics.service';

export type NodeType = 'MODULE' | 'CLASS' | 'FUNCTION';

export interface GraphNode {
  id: string;          // Unique ID (path for files, file::class for classes, etc.)
  label: string;       // Short name to display
  type: NodeType;
  parentId?: string;   // ID of the container
  children?: GraphNode[]; // Loaded children
  r?: number;          // Radius for visualization
  x?: number;          // D3 coordinates
  y?: number;
}

export interface GraphLink {
  source: string;
  target: string;
  value: number;       // Coupling strength
}

export interface HierarchicalData {
  nodes: GraphNode[];
  links: GraphLink[];
}

@Injectable({ providedIn: 'root' })
export class GraphDataService {
  private metrics = inject(MetricsService);

  /**
   * Loads all necessary metrics and stitches them into a unified graph structure.
   */
  loadHierarchy(repoId: string): Observable<HierarchicalData> {
    // Helper to catch errors for individual metrics so one failure doesn't break the whole graph
    const safeReq = (obs: Observable<any>) => obs.pipe(catchError(() => of({})));

    return forkJoin({
      files: safeReq(this.metrics.getMetric(repoId, 'files')),
      dependencies: safeReq(this.metrics.getDependencies(repoId)),
      classes: safeReq(this.metrics.getMetric(repoId, 'classes-per-file')),
      classCoupling: safeReq(this.metrics.getClassCoupling(repoId)),
      funcs: safeReq(this.metrics.getMetric(repoId, 'functions-per-file')),
      funcCoupling: safeReq(this.metrics.getMetric(repoId, 'function-coupling'))
    }).pipe(
      map(data => this.processData(data))
    );
  }

  private processData(data: any): HierarchicalData {
    const nodesMap = new Map<string, GraphNode>();
    const links: GraphLink[] = [];

    // 1. Process Modules (Files)
    // Handle both array format and object wrapper format
    let filePaths: string[] = [];
    if (Array.isArray(data.files)) {
      filePaths = data.files;
    } else if (Array.isArray(data.files?.result)) {
      filePaths = data.files.result;
    } else {
      // Fallback to dependencies keys if files metric is missing/empty
      filePaths = Object.keys(data.dependencies?.graph || {});
    }

    filePaths.forEach(path => {
      nodesMap.set(path, {
        id: path,
        label: path.split('/').pop() || path,
        type: 'MODULE',
        children: []
      });
    });

    // 2. Process Dependencies (Module -> Module links)
    const depGraph = data.dependencies?.graph || {};
    Object.entries(depGraph).forEach(([src, imports]: [string, any]) => {
      if (!nodesMap.has(src)) return;
      (imports as string[]).forEach(target => {
        if (nodesMap.has(target)) {
          links.push({ source: src, target: target, value: 1 });
        }
      });
    });

    // 3. Process Classes (Module Children)
    const classesPerFile = data.classes?.result || {};
    Object.entries(classesPerFile).forEach(([file, classObj]: [string, any]) => {
      if (!nodesMap.has(file)) return; // Skip if file not in base set
      const fileNode = nodesMap.get(file)!;

      Object.keys(classObj).forEach(className => {
        const classId = `${file}::${className}`;
        const classNode: GraphNode = {
          id: classId,
          label: className,
          type: 'CLASS',
          parentId: file,
          children: []
        };
        nodesMap.set(classId, classNode);
        fileNode.children?.push(classNode);
      });
    });

    // 4. Process Functions (Class Children OR Module Children)
    const funcsPerFile = data.funcs?.result || {};
    Object.entries(funcsPerFile).forEach(([file, funcObj]: [string, any]) => {
      if (!nodesMap.has(file)) return;
      
      // Naive heuristic: If function name starts with ClassName., put it in class, else in file
      // For a robust impl, we need AST data saying "this function belongs to this class"
      // Here we will put ALL functions as children of the FILE for simplicity, 
      // UNLESS we match a class name prefix.
      
      const fileNode = nodesMap.get(file)!;

      Object.keys(funcObj).forEach(funcName => {
        // Try to find a parent class in this file
        const parentClass = fileNode.children?.find(c => funcName.startsWith(c.label + '.'));
        
        const funcId = `${file}::${funcName}`;
        const funcNode: GraphNode = {
          id: funcId,
          label: funcName.split('.').pop() || funcName, // Remove class prefix for label
          type: 'FUNCTION',
          parentId: parentClass ? parentClass.id : file
        };
        
        nodesMap.set(funcId, funcNode);
        
        if (parentClass) {
          parentClass.children = parentClass.children || [];
          parentClass.children.push(funcNode);
        } else {
          // If it's a top level function, add to file
          // We only add to file if we strictly want Function support at file level
          // For this specific view "Module -> Class -> Func", usually functions belong to classes.
          // If a file has no classes, maybe it shouldn't have children in this view?
          // Let's add them to file to be safe.
          fileNode.children?.push(funcNode);
        }
      });
    });

    // 5. Process Class Coupling
    const clsCoupling = data.classCoupling?.result || {};
    // Format usually: { file: { ClassName: { "fan-out": { TargetClass: count } } } }
    // We need to map TargetClass to an ID. This is tricky if Class names are not unique.
    // We will try to resolve simple names.
    
    // Helper to find class ID by name (slow, but works for dataset size < 10k)
    const findClassId = (name: string): string | undefined => {
      for (const node of nodesMap.values()) {
        if (node.type === 'CLASS' && node.label === name) return node.id;
      }
      return undefined;
    };

    Object.entries(clsCoupling).forEach(([file, classes]: [string, any]) => {
      Object.entries(classes).forEach(([clsName, metrics]: [string, any]) => {
        const srcId = `${file}::${clsName}`;
        if (!nodesMap.has(srcId)) return;

        const fanOut = metrics['fan-out'] || {};
        Object.entries(fanOut).forEach(([targetName, count]: [string, any]) => {
          const targetId = findClassId(targetName);
          if (targetId && targetId !== srcId) {
            links.push({ source: srcId, target: targetId, value: Number(count) });
          }
        });
      });
    });

    // 6. Process Function Coupling
    const fnCoupling = data.funcCoupling?.result || {};
    Object.entries(fnCoupling).forEach(([file, funcs]: [string, any]) => {
      Object.entries(funcs).forEach(([fnName, metrics]: [string, any]) => {
        const srcId = `${file}::${fnName}`;
        // Only add link if source exists
        if (!nodesMap.has(srcId)) return;

        const fanOut = metrics['fan-out'] || {};
        Object.entries(fanOut).forEach(([targetFn, count]: [string, any]) => {
          // Target might be qualified or not. Try to resolve.
          // Ideally targetFn is "File::Func", but if it's just "Func", we search.
          let targetId = targetFn.includes('::') ? targetFn : undefined;
          
          if (!targetId) {
             // Try to find in same file
             const localCandidate = `${file}::${targetFn}`;
             if (nodesMap.has(localCandidate)) targetId = localCandidate;
          }

          if (targetId && nodesMap.has(targetId)) {
            links.push({ source: srcId, target: targetId, value: Number(count) });
          }
        });
      });
    });

    return {
      nodes: Array.from(nodesMap.values()),
      links
    };
  }
}