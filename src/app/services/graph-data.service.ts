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

// 2. PRESERVE FAN METRICS IN SERVICE
export interface GraphLink {
  source: string;
  target: string;
  value: number;
  type: 'DEPENDENCY' | 'COUPLING' | 'CALL';
  direction?: 'fan-in' | 'fan-out';
  fanIn?: number;          // NEW: Preserve actual counts
  fanOut?: number;         // NEW: Preserve actual counts
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
      classes: req('classes-per-file'),
      classCoupling: req('class-coupling'),
      funcs: req('functions-per-file'),
      funcCoupling: req('function-coupling'),


    }).pipe(
      map(data => this.buildGraph(data))
    );
  }

  private buildGraph(data: any): HierarchicalData {
    const nodesMap = new Map<string, GraphNode>();  // (id, node)
    const links: GraphLink[] = [];

    // --- 1. DIRECTORIES & FILES ---
    this.buildDirectories(data, nodesMap, links);

    // --- 2. CLASSES & METHODS ---
    // Changed: Now returns a Map that can hold multiple files per class name
    const classToFilesMap = this.buildClassToFileMap(data, nodesMap);

    // --- 3. STANDALONE FUNCTIONS ---
    const functionToFileMap = this.buildFunctionToFileMap(data, nodesMap);

    // --- 4. HIERARCHICAL LINK AGGREGATION ---
    const methodLinks = new Map<string, { count: number; direction: 'fan-out' | 'fan-in' }>();

    this.buildMethodLevelCoupling(data, nodesMap, classToFilesMap, methodLinks, links);

    const fnCoupling = data.funcCoupling?.result || {};
    const functionLinks = new Map<string, { count: number; direction: 'fan-out' | 'fan-in' }>();
    this.buildFunctionLevelCoupling(fnCoupling, nodesMap, functionToFileMap, functionLinks, links);

    const classLinks = new Map<string, { count: number; direction: 'fan-out' | 'fan-in' }>();
    this.buildClassLevelCoupling(methodLinks, nodesMap, classLinks, functionLinks, data, classToFilesMap, links);

    this.buildFileLevelCoupling(classLinks, nodesMap, functionLinks, links);

    return { nodes: Array.from(nodesMap.values()), links };
  }

  private buildFunctionToFileMap(data: any, nodesMap: Map<string, GraphNode>) {
    const funcsObj = data.funcs?.result || {};

    const functionToFileMap = new Map<string, string>(); // funcName -> file path
    const functionToClassMap = new Map<string, string>(); // funcName -> class id (if method)

    Object.entries(funcsObj).forEach(([file, funcMap]: [string, any]) => {
      if (!nodesMap.has(file)) return;
      const fileNode = nodesMap.get(file)!;

      Object.keys(funcMap).forEach(funcName => {
        // Check if function belongs to a class (by naming convention)
        const parentClass = fileNode.children?.find(c => c.type === 'CLASS' && (funcName.startsWith(c.label + '.') || funcName.startsWith(c.label + '::'))
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
        functionToFileMap.set(funcName, file);

        if (parentClass) {
          parentClass.children = parentClass.children || [];
          parentClass.children.push(node);
          functionToClassMap.set(funcName, parentClass.id);
        } else {
          fileNode.children = fileNode.children || [];
          fileNode.children.push(node);
        }
      });
    });
    return functionToFileMap;
  }

  private buildClassToFileMap(data: any, nodesMap: Map<string, GraphNode>): Map<string, string[]> {
    const classesObj = data.classes?.result || {};
    // CHANGED: Store array of files per class name to handle duplicates
    const classToFilesMap = new Map<string, string[]>();
    const methodToClassMap = new Map<string, string>();
    const methodToFileMap = new Map<string, string>();

    Object.entries(classesObj).forEach(([file, clsMap]: [string, any]) => {
      if (!nodesMap.has(file)) return;
      const parent = nodesMap.get(file)!;

      Object.entries(clsMap).forEach(([className, details]: [string, any]) => {
        const classId = `${file}::${className}`;

        // Store class -> files mapping (allow multiple files per class name)
        const existingFiles = classToFilesMap.get(className) || [];
        if (!existingFiles.includes(file)) {
          existingFiles.push(file);
        }
        classToFilesMap.set(className, existingFiles);

        const node: GraphNode = {
          id: classId,
          label: className,
          type: 'CLASS',
          parentId: file,
          children: [],
          loc: 1,
          depth: (parent.depth || 0) + 1
        };
        nodesMap.set(classId, node);
        parent.children?.push(node);

        // Create METHOD nodes
        const methods = details || [];
        if (Array.isArray(methods)) {
          methods.forEach((method: any) => {
            let methodName = method.key?.name || 'unknown';

            // Normalize constructor name
            const normalizedName = methodName === 'constructor' ? '_constructor' : methodName;
            const methodId = `${classId}::${normalizedName}`;

            const methodNode: GraphNode = {
              id: methodId,
              label: methodName === '_constructor' ? 'constructor' : methodName,
              type: 'FUNCTION',
              parentId: classId,
              loc: 1,
              depth: (node.depth || 0) + 1
            };
            nodesMap.set(methodId, methodNode);

            // Map alternate names for lookup compatibility
            if (methodName === 'constructor') {
              nodesMap.set(`${classId}::constructor`, methodNode);
            }

            node.children?.push(methodNode);

            methodToClassMap.set(methodId, classId);
            methodToFileMap.set(methodId, file);
          });
        }
      });
    });
    return classToFilesMap;
  }




  private buildFileLevelCoupling(classLinks: Map<string, { count: number; direction: "fan-out" | "fan-in"; }>, nodesMap: Map<string, GraphNode>, functionLinks: Map<string, { count: number; direction: "fan-out" | "fan-in"; }>, links: GraphLink[]) {
    const fileLinks = new Map<string, { count: number; direction: 'fan-out' | 'fan-in'; }>();

    // Aggregate class coupling up to FILE level
    classLinks.forEach((linkData, linkKey) => {
      const [srcClassId, targetClassId] = linkKey.split('->');
      const srcClass = nodesMap.get(srcClassId);
      const targetClass = nodesMap.get(targetClassId);

      if (!srcClass || !targetClass || srcClass.type !== 'CLASS' || targetClass.type !== 'CLASS') return;

      const srcFileId = srcClass.parentId!;
      const targetFileId = targetClass.parentId!;

      if (srcFileId !== targetFileId) {
        const fileLinkKey = `${srcFileId}->${targetFileId}`;
        const existing = fileLinks.get(fileLinkKey) || { count: 0, direction: linkData.direction };
        fileLinks.set(fileLinkKey, {
          count: existing.count + linkData.count,
          direction: linkData.direction
        });
      }
    });

    // Aggregate standalone function coupling up to FILE level
    // (when functions don't belong to any class, promote their coupling to FILE level)
    functionLinks.forEach((linkData, linkKey) => {
      const [srcFuncId, targetFuncId] = linkKey.split('->');
      const srcFunc = nodesMap.get(srcFuncId);
      const targetFunc = nodesMap.get(targetFuncId);

      if (!srcFunc || !targetFunc) return;

      // Only promote if BOTH are standalone (parent is FILE, not CLASS)
      const srcParent = nodesMap.get(srcFunc.parentId!);
      const targetParent = nodesMap.get(targetFunc.parentId!);

      if (srcParent?.type === 'FILE' && targetParent?.type === 'FILE') {
        const srcFileId = srcFunc.parentId!;
        const targetFileId = targetFunc.parentId!;

        if (srcFileId !== targetFileId) {
          const fileLinkKey = `${srcFileId}->${targetFileId}`;
          const existing = fileLinks.get(fileLinkKey) || { count: 0, direction: linkData.direction };
          fileLinks.set(fileLinkKey, {
            count: existing.count + linkData.count,
            direction: linkData.direction
          });
        }
      }
    });

    // Add file-level links to links array
    fileLinks.forEach((linkData, linkKey) => {
      const [srcId, targetId] = linkKey.split('->');
      links.push({
        source: srcId,
        target: targetId,
        value: linkData.count,
        type: 'DEPENDENCY',
        direction: linkData.direction
      });
    });
  }

  private buildClassLevelCoupling(
    methodLinks: Map<string, { count: number; direction: "fan-out" | "fan-in" }>,
    nodesMap: Map<string, GraphNode>,
    classLinks: Map<string, { count: number; direction: "fan-out" | "fan-in" }>,
    functionLinks: Map<string, { count: number; direction: "fan-out" | "fan-in" }>,
    data: any,
    classToFilesMap: Map<string, string[]>,  // CHANGED
    links: GraphLink[]
  ) {
    // Helper to find the correct file for a class
    const findClassFile = (className: string): string | undefined => {
      const files = classToFilesMap.get(className);
      if (!files || files.length === 0) return undefined;
      for (const file of files) {
        const classId = `${file}::${className}`;
        if (nodesMap.has(classId)) return file;
      }
      return files[0];
    };

    methodLinks.forEach((linkData, linkKey) => {
      const [srcMethodId, targetMethodId] = linkKey.split('->');
      const srcMethod = nodesMap.get(srcMethodId);
      const targetMethod = nodesMap.get(targetMethodId);

      if (!srcMethod || !targetMethod) return;

      const srcClassId = srcMethod.parentId;
      const targetClassId = targetMethod.parentId;

      if (srcClassId && targetClassId && srcClassId !== targetClassId) {
        const classLinkKey = `${srcClassId}->${targetClassId}`;
        const existing = classLinks.get(classLinkKey) || { count: 0, direction: linkData.direction };
        classLinks.set(classLinkKey, {
          count: existing.count + linkData.count,
          direction: linkData.direction
        });
      }
    });

    // Second, aggregate function-level coupling up to CLASS level
    functionLinks.forEach((linkData, linkKey) => {
      const [srcFuncId, targetFuncId] = linkKey.split('->');
      const srcFunc = nodesMap.get(srcFuncId);
      const targetFunc = nodesMap.get(targetFuncId);

      if (!srcFunc || !targetFunc) return;

      let srcClassId = srcFunc.parentId;
      let targetClassId = targetFunc.parentId;

      const srcClass = nodesMap.get(srcClassId as string);
      const targetClass = nodesMap.get(targetClassId as string);

      if (srcClass?.type === 'CLASS' && targetClass?.type === 'CLASS' && srcClassId !== targetClassId) {
        const classLinkKey = `${srcClassId}->${targetClassId}`;
        const existing = classLinks.get(classLinkKey) || { count: 0, direction: linkData.direction };
        classLinks.set(classLinkKey, {
          count: existing.count + linkData.count,
          direction: linkData.direction
        });
      }
    });

    // Third, add direct class-coupling metric links
    const clsCoupling = data.classCoupling?.result || {};

    Object.entries(clsCoupling).forEach(([file, clsMap]: [string, any]) => {
      Object.entries(clsMap).forEach(([srcClassName, methods]: [string, any]) => {
        if (!Array.isArray(methods)) return;

        const srcClassId = `${file}::${srcClassName}`;
        if (!nodesMap.has(srcClassId)) return;

        methods.forEach((method: any) => {
          const fanOut = method['fan-out'] || {};
          Object.entries(fanOut).forEach(([targetClassName, targetMethods]: [string, any]) => {
            const targetClassFile = findClassFile(targetClassName);
            if (!targetClassFile) return;

            const targetClassId = `${targetClassFile}::${targetClassName}`;
            if (!nodesMap.has(targetClassId) || srcClassId === targetClassId) return;

            const classLinkKey = `${srcClassId}->${targetClassId}`;
            const totalCount = Object.values(targetMethods as any).reduce((sum: number, val: any) =>
              sum + (typeof val === 'number' ? val : 0), 0
            );

            const existing = classLinks.get(classLinkKey) || { count: 0, direction: 'fan-out' };
            classLinks.set(classLinkKey, {
              count: existing.count + totalCount,
              direction: 'fan-out'
            });
          });

          const fanIn = method['fan-in'] || {};
          Object.entries(fanIn).forEach(([callerClassName, callerMethods]: [string, any]) => {
            const callerClassFile = findClassFile(callerClassName);
            if (!callerClassFile) return;

            const callerClassId = `${callerClassFile}::${callerClassName}`;
            if (!nodesMap.has(callerClassId) || srcClassId === callerClassId) return;

            const classLinkKey = `${callerClassId}->${srcClassId}`;
            const totalCount = Object.values(callerMethods as any).reduce((sum: number, val: any) =>
              sum + (typeof val === 'number' ? val : 0), 0
            );

            const existing = classLinks.get(classLinkKey) || { count: 0, direction: 'fan-in' };
            classLinks.set(classLinkKey, {
              count: existing.count + totalCount,
              direction: 'fan-in'
            });
          });
        });
      });
    });

    // Add class-level links to links array
    classLinks.forEach((linkData, linkKey) => {
      const [srcId, targetId] = linkKey.split('->');
      links.push({
        source: srcId,
        target: targetId,
        value: linkData.count,
        type: 'COUPLING',
        direction: linkData.direction
      });
    });
  }

  private buildFunctionLevelCoupling(fnCoupling: any, nodesMap: Map<string, GraphNode>, functionToFileMap: Map<string, string>, functionLinks: Map<string, { count: number; direction: "fan-out" | "fan-in"; }>, links: GraphLink[]) {
    Object.entries(fnCoupling).forEach(([srcFile, fnMap]: [string, any]) => {
      Object.entries(fnMap).forEach(([srcFuncName, details]: [string, any]) => {
        const srcFuncId = `${srcFile}::${srcFuncName}`;
        if (!nodesMap.has(srcFuncId)) return;

        // Process Fan-Out (srcFunc calls targetFunc)
        const fanOut = details['fan-out'] || {};
        Object.entries(fanOut).forEach(([targetFuncName, count]: [string, any]) => {
          const targetFile = functionToFileMap.get(targetFuncName);
          if (!targetFile) return;

          const targetFuncId = `${targetFile}::${targetFuncName}`;
          if (!nodesMap.has(targetFuncId) || srcFuncId === targetFuncId) return;

          const linkKey = `${srcFuncId}->${targetFuncId}`;
          const existing = functionLinks.get(linkKey) || { count: 0, direction: 'fan-out' };
          functionLinks.set(linkKey, {
            count: existing.count + Number(count),
            direction: 'fan-out'
          });
        });

        // Process Fan-In (other functions call srcFunc)
        const fanIn = details['fan-in'] || {};
        Object.entries(fanIn).forEach(([callerFuncName, count]: [string, any]) => {
          const callerFile = functionToFileMap.get(callerFuncName);
          if (!callerFile) return;

          const callerFuncId = `${callerFile}::${callerFuncName}`;
          if (!nodesMap.has(callerFuncId) || srcFuncId === callerFuncId) return;

          const linkKey = `${callerFuncId}->${srcFuncId}`;
          const existing = functionLinks.get(linkKey) || { count: 0, direction: 'fan-in' };
          functionLinks.set(linkKey, {
            count: existing.count + Number(count),
            direction: 'fan-in'
          });
        });
      });
    });

    // Add function-level links to links array
    functionLinks.forEach((linkData, linkKey) => {
      const [srcId, targetId] = linkKey.split('->');
      links.push({
        source: srcId,
        target: targetId,
        value: linkData.count,
        type: 'CALL',
        direction: linkData.direction
      });
    });
  }

  private buildMethodLevelCoupling(
    data: any,
    nodesMap: Map<string, GraphNode>,
    classToFilesMap: Map<string, string[]>,  // CHANGED: Now accepts array of files
    methodLinks: Map<string, { count: number; direction: "fan-out" | "fan-in" }>,
    links: GraphLink[]
  ) {
    const classesForCoupling = data.classCoupling?.result || {};

    const normalizeMethodName = (name: string): string => {
      return name === 'constructor' ? '_constructor' : name;
    };

    // Helper to find the correct file for a class (tries all known files)
    const findClassFile = (className: string): string | undefined => {
      const files = classToFilesMap.get(className);
      if (!files || files.length === 0) return undefined;

      // Try each file until we find one where the class exists
      for (const file of files) {
        const classId = `${file}::${className}`;
        if (nodesMap.has(classId)) return file;
      }
      return files[0]; // Fallback to first file
    };

    Object.entries(classesForCoupling).forEach(([file, clsMap]: [string, any]) => {
      Object.entries(clsMap).forEach(([className, methods]: [string, any]) => {
        if (!Array.isArray(methods)) return;

        const classId = `${file}::${className}`;
        if (!nodesMap.has(classId)) return;

        methods.forEach((method: any) => {
          let methodName = method.key?.name || 'unknown';
          const normalizedMethodName = normalizeMethodName(methodName);
          const srcMethodId = `${classId}::${normalizedMethodName}`;

          if (!nodesMap.has(srcMethodId)) return;

          // Process Fan-Out
          const fanOut = method['fan-out'] || {};
          Object.entries(fanOut).forEach(([targetClassName, targetMethods]: [string, any]) => {
            const targetClassFile = findClassFile(targetClassName);
            if (!targetClassFile) return;

            const targetClassId = `${targetClassFile}::${targetClassName}`;
            if (!nodesMap.has(targetClassId)) return;

            Object.entries(targetMethods).forEach(([targetMethodName, count]: [string, any]) => {
              const normalizedTargetName = normalizeMethodName(targetMethodName);
              const targetMethodId = `${targetClassId}::${normalizedTargetName}`;

              if (!nodesMap.has(targetMethodId) || srcMethodId === targetMethodId) return;

              const linkKey = `${srcMethodId}->${targetMethodId}`;
              const existing = methodLinks.get(linkKey) || { count: 0, direction: 'fan-out' };
              methodLinks.set(linkKey, {
                count: existing.count + Number(count),
                direction: 'fan-out'
              });
            });
          });

          // Process Fan-In
          const fanIn = method['fan-in'] || {};
          Object.entries(fanIn).forEach(([callerClassName, callerMethods]: [string, any]) => {
            const callerClassFile = findClassFile(callerClassName);
            if (!callerClassFile) return;

            const callerClassId = `${callerClassFile}::${callerClassName}`;
            if (!nodesMap.has(callerClassId)) return;

            Object.entries(callerMethods).forEach(([callerMethodName, count]: [string, any]) => {
              const normalizedCallerName = normalizeMethodName(callerMethodName);
              const callerMethodId = `${callerClassId}::${normalizedCallerName}`;

              if (!nodesMap.has(callerMethodId) || srcMethodId === callerMethodId) return;

              const linkKey = `${callerMethodId}->${srcMethodId}`;
              const existing = methodLinks.get(linkKey) || { count: 0, direction: 'fan-in' };
              methodLinks.set(linkKey, {
                count: existing.count + Number(count),
                direction: 'fan-in'
              });
            });
          });
        });
      });
    });

    // Add method-level links to links array
    methodLinks.forEach((linkData, linkKey) => {
      const [srcId, targetId] = linkKey.split('->');
      links.push({
        source: srcId,
        target: targetId,
        value: linkData.count,
        type: 'CALL',
        direction: linkData.direction
      });
    });
  }


  private buildDirectories(data: any, nodesMap: Map<string, GraphNode>, links: GraphLink[]) {
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
  }
}