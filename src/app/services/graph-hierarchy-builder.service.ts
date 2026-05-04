import { Injectable } from '@angular/core';
import { GraphNode, GraphLink } from '../types/graph.types';

/**
 * Builds the node hierarchy for the graph:
 * - Directories and files from file paths
 * - Classes and methods from class metrics
 * - Standalone functions from function metrics
 * 
 * This service focuses on NODE CREATION and parent-child relationships.
 * Link aggregation is handled separately.
 */
@Injectable({ providedIn: 'root' })
export class GraphHierarchyBuilderService {
  /**
   * Builds the complete node hierarchy from raw metrics data.
   * Returns nodesMap for link builders to reference.
   */
  buildHierarchy(data: any): Map<string, GraphNode> {
    const nodesMap = new Map<string, GraphNode>();

    // 1. Build directory and file structure
    this.buildDirectories(data, nodesMap);

    // 2. Build class hierarchy
    this.buildClasses(data, nodesMap);

    // 3. Build standalone functions
    this.buildStandaloneFunctions(data, nodesMap);

    return nodesMap;
  }

  /**
   * Creates DIRECTORY and FILE nodes from file paths.
   * Also creates file dependency links.
   */
  private buildDirectories(data: any, nodesMap: Map<string, GraphNode>): void {
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
  }

  /**
   * Creates CLASS and METHOD nodes from class metrics.
   * Returns classToFilesMap for link builders to handle duplicate class names.
   */
  buildClassesAndMethods(data: any, nodesMap: Map<string, GraphNode>): Map<string, string[]> {
    const classesObj = data.classes?.result || {};
    const classToFilesMap = new Map<string, string[]>();

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
          });
        }
      });
    });

    return classToFilesMap;
  }

  /**
   * Builds CLASS nodes only (without methods).
   * Used internally by buildHierarchy.
   */
  private buildClasses(data: any, nodesMap: Map<string, GraphNode>): void {
    this.buildClassesAndMethods(data, nodesMap);
  }

  /**
   * Creates FUNCTION nodes for standalone functions (not in classes).
   * Returns functionToFileMap for link builders.
   */
  buildStandaloneFunctions(data: any, nodesMap: Map<string, GraphNode>): Map<string, string> {
    const funcsObj = data.funcs?.result || {};
    const functionToFileMap = new Map<string, string>();

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
        functionToFileMap.set(funcName, file);

        if (parentClass) {
          parentClass.children = parentClass.children || [];
          parentClass.children.push(node);
        } else {
          fileNode.children = fileNode.children || [];
          fileNode.children.push(node);
        }
      });
    });

    return functionToFileMap;
  }
}
