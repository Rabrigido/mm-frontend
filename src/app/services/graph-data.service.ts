import { Injectable, inject } from '@angular/core';
import { forkJoin, map, Observable, of, catchError } from 'rxjs';
import { MetricsService } from './metrics.service';

export type NodeType = 'DIRECTORY' | 'FILE' | 'CLASS' | 'FUNCTION';

export interface GraphNode {
  id: string;
  label: string;
  type: NodeType;
  parentId?: string;
  children?: GraphNode[];
  loc?: number;
  x?: number;
  y?: number;
}

export interface GraphLink {
  source: string;
  target: string;
  value: number;
  type: 'DEPENDENCY' | 'COUPLING' | 'CALL';
}

export interface HierarchicalData {
  nodes: GraphNode[];
  links: GraphLink[];
}

@Injectable({ providedIn: 'root' })
export class GraphDataService {
  private metrics = inject(MetricsService);

  loadHierarchy(repoId: string): Observable<HierarchicalData> {
    const req = (name: string) => 
      this.metrics.getMetric(repoId, name).pipe(catchError(() => of({ result: {} })));

    return forkJoin({
      files: req('files'),
      loc: this.metrics.getLocSloc(repoId).pipe(catchError(() => of({ byFile: {} }))),
      dependencies: this.metrics.getDependencies(repoId).pipe(catchError(() => of({ graph: {} }))),
      classes: req('classes-per-file'),
      classCoupling: req('class-coupling'),
      funcs: req('functions-per-file'),
      funcCoupling: req('function-coupling')
    }).pipe(
      map(data => this.buildGraph(data))
    );
  }

  private buildGraph(data: any): HierarchicalData {
    const nodesMap = new Map<string, GraphNode>();
    const links: GraphLink[] = [];

    // --- 1. DIRECTORIES & FILES ---
    // Handle different API response formats for 'files'
    let filePaths: string[] = [];
    if (Array.isArray(data.files)) filePaths = data.files;
    else if (Array.isArray(data.files?.result)) filePaths = data.files.result;
    else filePaths = Object.keys(data.dependencies?.graph || {});

    filePaths.forEach(path => {
      const parts = path.split('/');
      const fileName = parts.pop()!;
      
      let currentPath = '';
      let parentId: string | undefined = undefined;

      // Create Directory Nodes
      parts.forEach(part => {
        const id = currentPath ? `${currentPath}/${part}` : part;
        
        if (!nodesMap.has(id)) {
          const dirNode: GraphNode = {
            id,
            label: part,
            type: 'DIRECTORY',
            parentId: parentId,
            children: []
          };
          nodesMap.set(id, dirNode);
          
          if (parentId) {
            const p = nodesMap.get(parentId)!;
            p.children = p.children || [];
            if (!p.children.find(c => c.id === id)) p.children.push(dirNode);
          }
        }
        
        currentPath = id;
        parentId = id;
      });

      // Create File Node
      const fileNode: GraphNode = {
        id: path,
        label: fileName,
        type: 'FILE',
        parentId: parentId,
        children: [],
        loc: data.loc?.byFile?.[path]?.loc || 10
      };
      nodesMap.set(path, fileNode);

      if (parentId) {
        const p = nodesMap.get(parentId)!;
        p.children = p.children || [];
        p.children.push(fileNode);
      }
    });

    // File Dependencies
    const depGraph = data.dependencies?.graph || {};
    Object.entries(depGraph).forEach(([src, imports]: [string, any]) => {
      if (!nodesMap.has(src)) return;
      (imports as string[]).forEach(target => {
        if (nodesMap.has(target)) {
          links.push({ source: src, target: target, value: 1, type: 'DEPENDENCY' });
        }
      });
    });

    // --- 2. CLASSES ---
    const classesObj = data.classes?.result || {};
    Object.entries(classesObj).forEach(([file, clsMap]: [string, any]) => {
      if (!nodesMap.has(file)) return;
      const parent = nodesMap.get(file)!;

      Object.keys(clsMap).forEach(className => {
        const id = `${file}::${className}`;
        const node: GraphNode = {
          id,
          label: className,
          type: 'CLASS',
          parentId: file,
          children: [],
          loc: 1
        };
        nodesMap.set(id, node);
        parent.children?.push(node);
      });
    });

    // Class Coupling
    const clsCoupling = data.classCoupling?.result || {};
    Object.entries(clsCoupling).forEach(([file, clsMap]: [string, any]) => {
      Object.entries(clsMap).forEach(([clsName, details]: [string, any]) => {
        const srcId = `${file}::${clsName}`;
        if (!nodesMap.has(srcId)) return;

        const fanOut = details['fan-out'] || {};
        Object.entries(fanOut).forEach(([targetCls, count]: [string, any]) => {
          const targetId = this.findClassId(nodesMap, targetCls);
          if (targetId && targetId !== srcId) {
            links.push({ source: srcId, target: targetId, value: Number(count), type: 'COUPLING' });
          }
        });
      });
    });

    // --- 3. FUNCTIONS ---
    const funcsObj = data.funcs?.result || {};
    Object.entries(funcsObj).forEach(([file, funcMap]: [string, any]) => {
      if (!nodesMap.has(file)) return;
      const fileNode = nodesMap.get(file)!;

      Object.keys(funcMap).forEach(funcName => {
        // Check if function belongs to a class
        const parentClass = fileNode.children?.find(c => 
          c.type === 'CLASS' && (funcName.startsWith(c.label + '.') || funcName.startsWith(c.label + '::'))
        );
        
        const id = `${file}::${funcName}`;
        const label = funcName.split('.').pop() || funcName;
        
        const node: GraphNode = {
          id,
          label,
          type: 'FUNCTION',
          parentId: parentClass ? parentClass.id : file,
          loc: 1
        };

        nodesMap.set(id, node);
        
        if (parentClass) {
          parentClass.children = parentClass.children || [];
          parentClass.children.push(node);
        } else {
          // Optional: Add standalone functions to file
          // fileNode.children?.push(node);
        }
      });
    });

    // Function Coupling
    const fnCoupling = data.funcCoupling?.result || {};
    Object.entries(fnCoupling).forEach(([file, fnMap]: [string, any]) => {
      Object.entries(fnMap).forEach(([fnName, details]: [string, any]) => {
        const srcId = `${file}::${fnName}`;
        if (!nodesMap.has(srcId)) return;

        const fanOut = details['fan-out'] || {};
        Object.entries(fanOut).forEach(([targetFn, count]: [string, any]) => {
          let targetId = targetFn.includes('::') ? targetFn : undefined;
          if (!targetId && nodesMap.has(`${file}::${targetFn}`)) targetId = `${file}::${targetFn}`;

          if (targetId && nodesMap.has(targetId)) {
            links.push({ source: srcId, target: targetId, value: Number(count), type: 'CALL' });
          }
        });
      });
    });

    return { nodes: Array.from(nodesMap.values()), links };
  }

  private findClassId(map: Map<string, GraphNode>, shortName: string): string | undefined {
    for (const node of map.values()) {
      if (node.type === 'CLASS' && node.label === shortName) return node.id;
    }
    return undefined;
  }
}