import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BaseGraphComponent, PhysicsConfig } from '../base-graph.component';
import { D3_CONFIG } from '../../config/d3-config';
import { graphs, colors } from '../../design-system';
import { GraphTreeModalComponent } from '../graph-tree-modal/graph-tree-modal.component';

@Component({
  selector: 'app-module-function-graph',
  standalone: true,
  imports: [CommonModule, GraphTreeModalComponent],
  templateUrl: './module-function-graph.component.html',
  styleUrls: ['./module-function-graph.component.css']
})
/**
 * Function-level call graph. Shows files and their functions with CALL-type links.
 * Uses stronger repulsion and shorter link distances for dense function layouts.
 */
export class ModuleFunctionGraphComponent extends BaseGraphComponent {
  // Design System
  graphs = graphs;
  colors = colors;
  showTreeModal = signal(false);

  /**
   * Module-function view physics: stronger charge/repulsion, shorter links
   * Creates a more spread-out view with better function separation
   */
  override getPhysicsConfig(): PhysicsConfig {
    return {
      chargeStrength: D3_CONFIG.PHYSICS.MODULE_FUNCTION.CHARGE_STRENGTH,
      linkDistance: D3_CONFIG.PHYSICS.MODULE_FUNCTION.LINK_DISTANCE,
      centerStrength: D3_CONFIG.PHYSICS.MODULE_FUNCTION.CENTER_STRENGTH,
      collidePadding: D3_CONFIG.PHYSICS.MODULE_FUNCTION.COLLIDE_PADDING,
      collideIterations: D3_CONFIG.PHYSICS.MODULE_FUNCTION.COLLIDE_ITERATIONS,
      clusterStrength: 0.15,  // Reduced for looser clustering
      enclosurePushForce: 0.08,
      enclosureLeashForce: 0.08,
    };
  }

  /**
   * Color scheme: centralized in design system
   */
  override getColorScheme(): Record<string, string> {
    return { ...colors.visualizationHex };
  }

  /**
   * Radius scheme: same as hierarchical
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
   * For module-function view: start with root nodes
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

