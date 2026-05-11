import { Component, Input, Output, EventEmitter, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GraphNode, NodeType } from '../../types/graph.types';
import { graphs, colors } from '../../design-system';

/** A flattened tree item used for rendering the hierarchical list. */
interface TreeItem {
  node: GraphNode;
  depth: number;
  hasChildren: boolean;
}

/** Material icon names by node type. */
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
/**
 * Modal that displays a searchable, hierarchical tree of graph nodes.
 * Emits nodeSelected when a user toggles a node's visibility.
 */
export class GraphTreeModalComponent {
  @Input({ required: true }) nodes: GraphNode[] = [];
  @Input() hiddenNodeIds = new Set<string>();
  @Input() isOpen = false;
  @Output() close = new EventEmitter<void>();
  @Output() nodeSelected = new EventEmitter<string>();

  graphs = graphs;

  searchText = signal('');
  private expandedSignal = signal<Set<string>>(new Set());

  /**
   * Flattened tree list. When searchText is non-empty, only matching nodes
   * (and their ancestors) are included.
   */
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

  /**
   * Returns a Set of all node IDs (including ancestors) that match the search query.
   */
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

  /**
   * Recursively adds node and its expanded children to the flat result array,
   * filtering by matches set when search is active.
   */
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

  getNodeColor(type: string): string { return (colors.visualizationHex as Record<string, string>)[type] || '#999'; }
  isNodeHidden(id: string): boolean { return this.hiddenNodeIds.has(id); }

  toggleExpand(id: string): void {
    const set = new Set(this.expandedSignal());
    if (set.has(id)) set.delete(id); else set.add(id);
    this.expandedSignal.set(set);
  }

  onSearch(event: Event): void { this.searchText.set((event.target as HTMLInputElement).value); }
  treeExpanded(id: string): boolean { return this.expandedSignal().has(id); }
  selectNode(id: string): void { this.nodeSelected.emit(id); }
  closeModal(): void { this.close.emit(); }
  stopPropagation(event: Event): void { event.stopPropagation(); }
}
