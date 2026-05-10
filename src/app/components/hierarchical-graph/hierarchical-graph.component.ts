import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BaseGraphComponent, PhysicsConfig } from '../base-graph.component';
import { D3_CONFIG } from '../../config/d3-config';
import { graphs, colors } from '../../design-system';
import { GraphTreeModalComponent } from '../graph-tree-modal/graph-tree-modal.component';

@Component({
  selector: 'app-hierarchical-graph',
  standalone: true,
  imports: [CommonModule, GraphTreeModalComponent],
  templateUrl: './hierarchical-graph.component.html',
  
  styleUrls: ['./hierarchical-graph.component.css']
})
/**
 * Hierarchical graph view showing the full directory/file/class/function tree.
 * Root nodes (no parentId) are shown initially; clicking expands children.
 */
export class HierarchicalGraphComponent extends BaseGraphComponent {
  // Design System
  graphs = graphs;
  colors = colors;
  showTreeModal = signal(false);

  /**
   * Hierarchical view physics: moderate separation with strong cluster effect
   * Shows all levels of hierarchy with folder enclosures
   */
  override getPhysicsConfig(): PhysicsConfig {
    return {
      chargeStrength: D3_CONFIG.PHYSICS.HIERARCHICAL.CHARGE_STRENGTH,
      linkDistance: D3_CONFIG.PHYSICS.HIERARCHICAL.LINK_DISTANCE,
      centerStrength: D3_CONFIG.PHYSICS.HIERARCHICAL.CENTER_STRENGTH,
      collidePadding: D3_CONFIG.PHYSICS.HIERARCHICAL.COLLIDE_PADDING,
      collideIterations: D3_CONFIG.PHYSICS.HIERARCHICAL.COLLIDE_ITERATIONS,
      clusterStrength: 0.2,
      enclosurePushForce: D3_CONFIG.ENCLOSURE.PUSH_FORCE,
      enclosureLeashForce: D3_CONFIG.ENCLOSURE.LEASH_FORCE,
    };
  }

  /**
   * Color scheme: directories (amber), files (slate), classes (pink), functions (emerald)
   */
  override getColorScheme(): Record<string, string> {
    return {
      DIRECTORY: '#f59e0b', // Amber
      FILE: '#64748b',      // Slate
      CLASS: '#ec4899',     // Pink
      FUNCTION: '#10b981',  // Emerald
      MODULE: '#6366f1'     // Fallback
    };
  }

  /**
   * Radius scheme for different node types
   */
  override getRadiusScheme(): Record<string, number> {
    return {
      DIRECTORY: 35,
      FILE: 20,
      CLASS: 12,
      FUNCTION: 6,
      MODULE: 20
    };
  }

  /**
   * For hierarchical view: start with only root nodes
   * User can click to expand and see child nodes
   */
  override filterNodesAndLinks(): void {
    const hidden = this.hiddenNodes();
    const rootNodes = Array.from(this.allNodesMap.values())
      .filter(n => !n.parentId && !hidden.has(n.id));

    this.nodes = rootNodes.map(n => this.createRenderNode(n));
    this.rebuildLinks();
  }
}
