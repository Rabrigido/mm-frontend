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
  depth?: number; // Added depth for rendering order
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

@Injectable({  providedIn: 'root' })
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
      let depth = 0;

      // Create Directory Nodes
      parts.forEach(part => {
        const id = currentPath ? `${currentPath}/${part}` : part;
        
        if (!nodesMap.has(id)) {
          const dirNode: GraphNode = {
            id,
            label: part,
            type: 'DIRECTORY',
            parentId: parentId,
            children: [],
            depth: depth
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
        depth++;
      });

      // Create File Node
      const fileNode: GraphNode = {
        id: path,
        label: fileName,
        type: 'FILE',
        parentId: parentId,
        children: [],
        loc: data.loc?.byFile?.[path]?.loc || 10,
        depth: depth
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

      Object.entries(clsMap).forEach(([className, details]: [string, any]) => {
        const id = `${file}::${className}`;
        const node: GraphNode = {
          id,
          label: className,
          type: 'CLASS',
          parentId: file,
          children: [],
          loc: 1,
          depth: (parent.depth || 0) + 1
        };
        nodesMap.set(id, node);
        parent.children?.push(node);

        // FIX: Extract methods directly from class details if available
        // This ensures methods are listed as children of the class
        const methods = details.methods || [];
        if (Array.isArray(methods)) {
          methods.forEach((methodName: string) => {
            const methodId = `${id}::${methodName}`;
            // Avoid duplicates if function processing also finds it
            if (!nodesMap.has(methodId)) {
              const methodNode: GraphNode = {
                id: methodId,
                label: methodName,
                type: 'FUNCTION',
                parentId: id,
                loc: 1,
                depth: (node.depth || 0) + 1
              };
              nodesMap.set(methodId, methodNode);
              node.children?.push(methodNode);
            }
          });
        }
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
        // Check if function belongs to a class (by naming convention)
        const parentClass = fileNode.children?.find(c => 
          c.type === 'CLASS' && (funcName.startsWith(c.label + '.') || funcName.startsWith(c.label + '::'))
        );
        
        // If we already created this node via class methods, skip or update
        const id = `${file}::${funcName}`;
        if (nodesMap.has(id)) return; 

        const label = funcName.split('.').pop() || funcName;
        const parentId = parentClass ? parentClass.id : file;
        const parentDepth = parentClass ? parentClass.depth : fileNode.depth;

        const node: GraphNode = {
          id,
          label,
          type: 'FUNCTION',
          parentId: parentId,
          loc: 1,
          depth: (parentDepth || 0) + 1
        };

        nodesMap.set(id, node);
        
        if (parentClass) {
          parentClass.children = parentClass.children || [];
          parentClass.children.push(node);
        } else {
          // Optional: Add standalone functions to file children if needed
          // fileNode.children?.push(node);
        }
      });
    });

    // Function Coupling
    const fnCoupling = data.funcCoupling?.result || {};
    Object.entries(fnCoupling).forEach(([file, fnMap]: [string, any]) => {
      Object.entries(fnMap).forEach(([fnName, details]: [string, any]) => {
        // Construct ID consistent with how nodes are created
        // If function is inside a class, the ID format is file::ClassName::MethodName
        // If standalone, it might be file::functionName
        
        // We need to find the actual node ID for this function name
        const srcNode = this.findFunctionNode(nodesMap, file, fnName);
        if (!srcNode) return;

        const fanOut = details['fan-out'] || {};
        Object.entries(fanOut).forEach(([targetFn, count]: [string, any]) => {
            // Target might be in another file or same file
            // We need a robust way to find the target node ID
            const targetNode = this.findFunctionNodeGlobal(nodesMap, targetFn);
            
            if (targetNode && targetNode.id !== srcNode.id) {
                links.push({ 
                    source: srcNode.id, 
                    target: targetNode.id, 
                    value: Number(count), 
                    type: 'CALL' 
                });
            }
        });
      });
    });

    return { nodes: Array.from(nodesMap.values()), links };
  }

  private findFunctionNode(map: Map<string, GraphNode>, file: string, funcName: string): GraphNode | undefined {
      // Try exact match first
      let id = `${file}::${funcName}`;
      if (map.has(id)) return map.get(id);

      // Try to find if it's a method in a class in this file
      // funcName might be "ClassName.methodName" or just "methodName"
      for (const node of map.values()) {
          if (node.parentId === file || node.id.startsWith(file)) {
             if (node.label === funcName) return node;
             if (node.id.endsWith(`::${funcName}`)) return node;
          }
      }
      return undefined;
  }

  private findFunctionNodeGlobal(map: Map<string, GraphNode>, funcName: string): GraphNode | undefined {
      // funcName could be "methodName", "ClassName.methodName", or "file::methodName"
      for (const node of map.values()) {
          if (node.type === 'FUNCTION') {
              if (node.label === funcName) return node;
              if (node.id.endsWith(`::${funcName}`)) return node;
              // Check for Class.method format
              const parts = node.id.split('::');
              if (parts.length >= 3) {
                  const method = parts.pop();
                  const cls = parts.pop();
                  if (`${cls}.${method}` === funcName) return node;
              }
          }
      }
      return undefined;
  }

  private findClassId(map: Map<string, GraphNode>, shortName: string): string | undefined {
    for (const node of map.values()) {
      if (node.type === 'CLASS' && node.label === shortName) return node.id;
    }
    return undefined;
  }
}