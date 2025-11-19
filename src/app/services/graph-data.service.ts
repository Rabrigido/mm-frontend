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
  depth?: number;
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

    // File Dependencies (Imports)
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

        // Create nodes for methods listed in classes-per-file
        const methods = details.methods || [];
        if (Array.isArray(methods)) {
          methods.forEach((methodName: string) => {
            const methodId = `${id}::${methodName}`;
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

    // --- 3. FUNCTIONS (Standalone & Mapping) ---
    const funcsObj = data.funcs?.result || {};
    Object.entries(funcsObj).forEach(([file, funcMap]: [string, any]) => {
      if (!nodesMap.has(file)) return;
      const fileNode = nodesMap.get(file)!;

      Object.keys(funcMap).forEach(funcName => {
        // Check if function belongs to a class (by naming convention)
        const parentClass = fileNode.children?.find(c => 
          c.type === 'CLASS' && (funcName.startsWith(c.label + '.') || funcName.startsWith(c.label + '::'))
        );
        
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
          // FIX: Add standalone functions to file children
          fileNode.children = fileNode.children || [];
          fileNode.children.push(node);
        }
      });
    });

    // --- 4. CLASS COUPLING (Links) ---
    const clsCoupling = data.classCoupling?.result || {};
    Object.entries(clsCoupling).forEach(([file, clsMap]: [string, any]) => {
      Object.entries(clsMap).forEach(([clsName, methods]: [string, any]) => {
        // API returns an array of method objects for each class
        if (!Array.isArray(methods)) return;

        methods.forEach((method: any) => {
            const methodName = method.key?.name;
            if (!methodName) return;

            const srcId = `${file}::${clsName}::${methodName}`;
            
            // Process Fan-Out
            const fanOut = method['fan-out'] || {};
            Object.entries(fanOut).forEach(([targetCls, targetMethods]: [string, any]) => {
                // targetMethods is { "methodName": count }
                Object.entries(targetMethods).forEach(([targetMethodName, count]: [string, any]) => {
                    // Find the file where targetCls is defined
                    const targetClassId = this.findClassId(nodesMap, targetCls);
                    
                    if (targetClassId) {
                        const targetId = `${targetClassId}::${targetMethodName}`;
                        
                        // Create link if both nodes exist
                        if (nodesMap.has(srcId) && nodesMap.has(targetId)) {
                             links.push({ source: srcId, target: targetId, value: Number(count), type: 'COUPLING' });
                        } 
                        // Fallback: Link method to class if target method node missing
                        else if (nodesMap.has(srcId)) {
                             links.push({ source: srcId, target: targetClassId, value: Number(count), type: 'COUPLING' });
                        }
                    }
                });
            });
        });
      });
    });

    // --- 5. FUNCTION COUPLING (Links) ---
    const fnCoupling = data.funcCoupling?.result || {};
    Object.entries(fnCoupling).forEach(([file, fnMap]: [string, any]) => {
      Object.entries(fnMap).forEach(([fnName, details]: [string, any]) => {
        const srcNode = this.findFunctionNode(nodesMap, file, fnName);
        if (!srcNode) return;

        const fanOut = details['fan-out'] || {};
        Object.entries(fanOut).forEach(([targetFn, count]: [string, any]) => {
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
      // 1. Try exact ID match
      let id = `${file}::${funcName}`;
      if (map.has(id)) return map.get(id);

      // 2. Try finding it as a child of the file (standalone)
      const fileNode = map.get(file);
      if (fileNode && fileNode.children) {
          const child = fileNode.children.find(c => c.label === funcName && c.type === 'FUNCTION');
          if (child) return child;
      }

      // 3. Try finding it as a method of a class in the file
      // funcName might be "ClassName.methodName"
      for (const node of map.values()) {
          if (node.parentId === file || node.id.startsWith(file)) {
             if (node.label === funcName) return node;
             if (node.id.endsWith(`::${funcName}`)) return node;
          }
      }
      return undefined;
  }

  private findFunctionNodeGlobal(map: Map<string, GraphNode>, funcName: string): GraphNode | undefined {
      for (const node of map.values()) {
          if (node.type === 'FUNCTION') {
              // Exact label match
              if (node.label === funcName) return node;
              
              // ID suffix match (file::funcName)
              if (node.id.endsWith(`::${funcName}`)) return node;
              
              // Class.method match
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