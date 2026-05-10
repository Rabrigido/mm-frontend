import { Component, Input, Output, EventEmitter, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GraphNode, NodeType } from '../../types/graph.types';
import { graphs } from '../../design-system';

interface TreeItem {
  node: GraphNode;
  depth: number;
  hasChildren: boolean;
}

const NODE_COLORS: Record<NodeType, string> = {
  DIRECTORY: '#f59e0b',
  FILE: '#64748b',
  CLASS: '#ec4899',
  FUNCTION: '#10b981',
  METHOD: '#10b981',
};

const NODE_ICONS: Record<NodeType, string> = {
  DIRECTORY: 'folder',
  FILE: 'description',
  CLASS: 'widgets',
  FUNCTION: 'code',
  METHOD: 'code',
};

@Component({
  selector: 'app-graph-tree-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './graph-tree-modal.component.html',
})
export class GraphTreeModalComponent {
  @Input({ required: true }) nodes: GraphNode[] = [];
  @Input() isOpen = false;
  @Output() close = new EventEmitter<void>();
  @Output() nodeSelected = new EventEmitter<string>();

  graphs = graphs;

  searchText = signal('');
  private expandedSignal = signal<Set<string>>(new Set());

  readonly treeItems = computed(() => {
    const search = this.searchText().toLowerCase().trim();
    const expanded = this.expandedSignal();
    const nodeMap = new Map(this.nodes.map(n => [n.id, n]));
    const matches = search ? this.computeMatches(search, nodeMap) : null;
    const result: TreeItem[] = [];

    for (const node of this.nodes) {
      if (!node.parentId) {
        this.addItems(node, 0, result, expanded, matches);
      }
    }

    return result;
  });

  private computeMatches(search: string, nodeMap: Map<string, GraphNode>): Set<string> {
    const matches = new Set<string>();
    for (const node of this.nodes) {
      if (node.label.toLowerCase().includes(search) || node.id.toLowerCase().includes(search)) {
        let curr: GraphNode | undefined = node;
        while (curr) {
          matches.add(curr.id);
          curr = curr.parentId ? nodeMap.get(curr.parentId) : undefined;
        }
      }
    }
    return matches;
  }

  private addItems(
    node: GraphNode,
    depth: number,
    result: TreeItem[],
    expanded: Set<string>,
    matches: Set<string> | null,
  ): void {
    if (matches && !matches.has(node.id)) return;

    const hasChildren = !!node.children?.length;
    result.push({ node, depth, hasChildren });

    if (hasChildren && expanded.has(node.id) && node.children) {
      for (const child of node.children) {
        this.addItems(child, depth + 1, result, expanded, matches);
      }
    }
  }

  getNodeColor(type: NodeType): string {
    return NODE_COLORS[type] || '#999';
  }

  toggleExpand(id: string): void {
    const set = new Set(this.expandedSignal());
    if (set.has(id)) set.delete(id);
    else set.add(id);
    this.expandedSignal.set(set);
  }

  onSearch(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.searchText.set(value);
  }

  treeExpanded(id: string): boolean {
    return this.expandedSignal().has(id);
  }

  selectNode(id: string): void {
    this.nodeSelected.emit(id);
    this.close.emit();
  }

  closeModal(): void {
    this.close.emit();
  }

  stopPropagation(event: Event): void {
    event.stopPropagation();
  }
}
