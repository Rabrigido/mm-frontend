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
   * Builds all links at all levels.
   * Returns links array to be added to HierarchicalData.
   */
  buildAllLinks(
    data: any,
    nodesMap: Map<string, GraphNode>,
    classToFilesMap: Map<string, string[]>,
    functionToFileMap: Map<string, string>
  ): GraphLink[] {
    const links: GraphLink[] = [];

    // 0. File-level dependencies (imports)
    this.buildFileDependencies(data, nodesMap, links);

    // 1. Method-level coupling
    const methodLinks = new Map<string, { count: number; direction: 'fan-out' | 'fan-in' }>();
    this.buildMethodLevelCoupling(data, nodesMap, classToFilesMap, methodLinks, links);

    // 2. Function-level coupling
    const functionLinks = new Map<string, { count: number; direction: 'fan-out' | 'fan-in' }>();
    this.buildFunctionLevelCoupling(data.funcCoupling?.result || {}, nodesMap, functionToFileMap, functionLinks, links);

    // 3. Class-level aggregation
    const classLinks = new Map<string, { count: number; direction: 'fan-out' | 'fan-in' }>();
    this.buildClassLevelCoupling(methodLinks, nodesMap, classLinks, functionLinks, data, classToFilesMap, links);

    // 4. File-level aggregation
    this.buildFileLevelCoupling(classLinks, nodesMap, functionLinks, links);

    return links;
  }

  /**
   * Builds FILE-level dependency links from file imports.
   * These represent direct file-to-file dependencies.
   */
  private buildFileDependencies(
    data: any,
    nodesMap: Map<string, GraphNode>,
    links: GraphLink[]
  ) {
    const depGraph = data.dependencies?.graph || {};
    Object.entries(depGraph).forEach(([src, imports]: [string, any]) => {
      if (!nodesMap.has(src)) return;
      (imports as string[]).forEach(target => {
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
   * Builds METHOD-level coupling from method metrics.
   * These are typically aggregated up to CLASS level.
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
   * Builds FUNCTION-level coupling from function metrics.
   * These are typically aggregated up to CLASS or FILE level.
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
   * Aggregates method and function coupling UP to CLASS level.
   * Deduplicates multiple methods calling same class.
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
   * Aggregates class and function coupling UP to FILE level.
   * Creates file-level dependencies.
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
        type: 'DEPENDENCY',
        direction: linkData.direction
      });
    });
  }
}
