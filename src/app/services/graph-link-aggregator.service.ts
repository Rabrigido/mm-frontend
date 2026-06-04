import { Injectable } from '@angular/core';
import { GraphNode, GraphLink } from '../types/graph.types';

/**
 * Aggregates coupling/dependency links at different levels of the hierarchy.
 * 
 * Link building process:
 * 1. Method-level coupling (from method metrics)
 * 2. Function-level coupling (from function metrics)
 * 3. Class-level aggregation (methods -> classes)
 * 4. File-level aggregation (classes + functions -> files)
 * 
 * This service focuses purely on LINK CREATION AND AGGREGATION.
 */
@Injectable({ providedIn: 'root' })
export class GraphLinkAggregatorService {
  /**
   * Builds all links at all hierarchy levels (file dependency + method/function/class/file coupling).
   * Pipeline: file deps -> method coupling -> function coupling -> class aggregation -> file aggregation.
   */
  buildAllLinks(
    data: any,
    nodesMap: Map<string, GraphNode>,
    classToFilesMap: Map<string, string[]>,
    functionToFileMap: Map<string, string>,
    fileCoupling?: Record<string, { fanIn: string[]; fanOut: string[] }>
  ): GraphLink[] {
    const links: GraphLink[] = [];

    // 0. File-level dependencies (imports from file-coupling fanOut)
    this.buildFileDependencies(fileCoupling, nodesMap, links);

    // 1. Method-level coupling
    const methodLinks = new Map<string, { count: number; direction: 'fan-out' | 'fan-in' }>();
    this.buildMethodLevelCoupling(data, nodesMap, classToFilesMap, methodLinks, links);

    // 2. Function-level coupling
    const functionLinks = new Map<string, { count: number; direction: 'fan-out' | 'fan-in' }>();
    this.buildFunctionLevelCoupling(data.funcCoupling?.result || {}, nodesMap, functionToFileMap, functionLinks, links);

    // 3. Class-level aggregation
    const classLinks = new Map<string, { count: number; direction: 'fan-out' | 'fan-in' }>();
    this.buildClassLevelCoupling(methodLinks, nodesMap, classLinks, functionLinks, data, classToFilesMap, links);

    // 4. Module-level aggregation (deduplicated by parent directory)
    this.buildModuleLevelCoupling(fileCoupling, nodesMap, links);

    return links;
  }

  /**
   * Creates DEPENDENCY-type links from file-coupling fanOut data.
   * One link per import between source and target file.
   */
  private buildFileDependencies(
    fileCoupling: Record<string, { fanIn: string[]; fanOut: string[] }> | undefined,
    nodesMap: Map<string, GraphNode>,
    links: GraphLink[]
  ) {
    if (!fileCoupling) return;

    Object.entries(fileCoupling).forEach(([src, coupling]) => {
      if (!nodesMap.has(src)) return;
      coupling.fanOut.forEach(target => {
        if (nodesMap.has(target) && src !== target) {
          links.push({
            source: src,
            target: target,
            value: 1,
            type: 'DEPENDENCY'
          });
        }
      });
    });
  }

  /**
   * Creates CALL-type links from method-level fan-in/fan-out metrics.
   * Normalizes constructor names, maps class names to files, and builds src->target links.
   */
  private buildMethodLevelCoupling(
    data: any,
    nodesMap: Map<string, GraphNode>,
    classToFilesMap: Map<string, string[]>,
    methodLinks: Map<string, { count: number; direction: 'fan-out' | 'fan-in' }>,
    links: GraphLink[]
  ) {
    const classesForCoupling = data.classCoupling?.result || {};

    const normalizeMethodName = (name: string): string => {
      return name === 'constructor' ? '_constructor' : name;
    };

    const findClassFile = (className: string): string | undefined => {
      const files = classToFilesMap.get(className);
      if (!files || files.length === 0) return undefined;
      for (const file of files) {
        const classId = `${file}::${className}`;
        if (nodesMap.has(classId)) return file;
      }
      return files[0];
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

  /**
   * Creates CALL-type links from standalone function fan-in/fan-out metrics.
   * Maps function names to their containing files for cross-file references.
   */
  private buildFunctionLevelCoupling(
    fnCoupling: any,
    nodesMap: Map<string, GraphNode>,
    functionToFileMap: Map<string, string>,
    functionLinks: Map<string, { count: number; direction: 'fan-out' | 'fan-in' }>,
    links: GraphLink[]
  ) {
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

  /**
   * Aggregates method + function CALL links into COUPLING-type links at CLASS level.
   * Also adds direct class-coupling metrics from backend. Deduplicates multi-method calls.
   */
  private buildClassLevelCoupling(
    methodLinks: Map<string, { count: number; direction: 'fan-out' | 'fan-in' }>,
    nodesMap: Map<string, GraphNode>,
    classLinks: Map<string, { count: number; direction: 'fan-out' | 'fan-in' }>,
    functionLinks: Map<string, { count: number; direction: 'fan-out' | 'fan-in' }>,
    data: any,
    classToFilesMap: Map<string, string[]>,
    links: GraphLink[]
  ) {
    const findClassFile = (className: string): string | undefined => {
      const files = classToFilesMap.get(className);
      if (!files || files.length === 0) return undefined;
      for (const file of files) {
        const classId = `${file}::${className}`;
        if (nodesMap.has(classId)) return file;
      }
      return files[0];
    };

    // 1. Aggregate from method-level coupling
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

    // 2. Aggregate from function-level coupling (only if both are methods)
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

    // 3. Add direct class-coupling metric links
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

  /**
   * Aggregates class + function COUPLING links into DEPENDENCY-type links at FILE level.
   * Standalone functions are promoted to their parent file for inter-file links.
   */
  private buildFileLevelCoupling(
    classLinks: Map<string, { count: number; direction: 'fan-out' | 'fan-in' }>,
    nodesMap: Map<string, GraphNode>,
    functionLinks: Map<string, { count: number; direction: 'fan-out' | 'fan-in' }>,
    links: GraphLink[]
  ) {
    const fileLinks = new Map<string, { count: number; direction: 'fan-out' | 'fan-in' }>();

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
    functionLinks.forEach((linkData, linkKey) => {
      const [srcFuncId, targetFuncId] = linkKey.split('->');
      const srcFunc = nodesMap.get(srcFuncId);
      const targetFunc = nodesMap.get(targetFuncId);

      if (!srcFunc || !targetFunc) return;

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
        type: 'COUPLING',
        direction: linkData.direction
      });
    });
  }

  /**
   * Builds module-level DEPENDENCY links from file-coupling data by aggregating
   * file-to-file imports up to the directory (module) level.
   *
   * Deduplication logic: if two files in Module A both import files from Module B,
   * only one link A→B is created (value = 1). This contrasts with file-level links
   * where each individual import counts separately.
   */
  private buildModuleLevelCoupling(
    fileCoupling: Record<string, { fanIn: string[]; fanOut: string[] }> | undefined,
    nodesMap: Map<string, GraphNode>,
    links: GraphLink[]
  ): void {
    if (!fileCoupling) return;

    // Resolve the parent directory (module) ID for a given file path.
    // Falls back to matching by file name if exact path lookup fails.
    const getModuleId = (filePath: string): string | undefined => {
      let node = nodesMap.get(filePath);
      if (!node) {
        // Fallback: match by file name (last path segment)
        const fileName = filePath.split('/').pop() || filePath.split('\\').pop();
        for (const [, n] of nodesMap) {
          if (n.type === 'FILE' && n.label === fileName) {
            node = n;
            break;
          }
        }
      }
      if (!node?.parentId) return undefined;
      // Walk up to find the nearest DIRECTORY ancestor
      let curr = nodesMap.get(node.parentId);
      while (curr && curr.type !== 'DIRECTORY') {
        if (!curr.parentId) return undefined;
        curr = nodesMap.get(curr.parentId);
      }
      return curr?.id;
    };

    // Track unique (srcModule → tgtModule) pairs for deduplication
    const modulePairs = new Set<string>();

    for (const [srcFile, data] of Object.entries(fileCoupling)) {
      const srcModule = getModuleId(srcFile);
      if (!srcModule) continue;

      for (const tgtFile of data.fanOut) {
        const tgtModule = getModuleId(tgtFile);
        if (!tgtModule || srcModule === tgtModule) continue;

        modulePairs.add(`${srcModule}->${tgtModule}`);
      }
    }

    // Create one link per unique module pair
    modulePairs.forEach(pair => {
      const [srcId, targetId] = pair.split('->');
      links.push({
        source: srcId,
        target: targetId,
        value: 1,
        type: 'DEPENDENCY',
        level: 'module'
      });
    });
  }
}
