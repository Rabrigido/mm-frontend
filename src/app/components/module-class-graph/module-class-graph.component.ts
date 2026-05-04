import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BaseGraphComponent, PhysicsConfig } from '../base-graph.component';
import { D3_CONFIG } from '../../config/d3-config';

@Component({
  selector: 'app-module-class-graph',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './module-class-graph.component.html',
  styleUrls: ['./module-class-graph.component.css']
})
export class ModuleClassGraphComponent extends BaseGraphComponent {
  /**
   * Module-class view physics: same as hierarchical but with reduced push force
   * Shows file and class relationships
   */
  override getPhysicsConfig(): PhysicsConfig {
    return {
      chargeStrength: D3_CONFIG.PHYSICS.MODULE_CLASS.CHARGE_STRENGTH,
      linkDistance: D3_CONFIG.PHYSICS.MODULE_CLASS.LINK_DISTANCE,
      centerStrength: D3_CONFIG.PHYSICS.MODULE_CLASS.CENTER_STRENGTH,
      collidePadding: D3_CONFIG.PHYSICS.MODULE_CLASS.COLLIDE_PADDING,
      collideIterations: D3_CONFIG.PHYSICS.MODULE_CLASS.COLLIDE_ITERATIONS,
      clusterStrength: 0.2,
      enclosurePushForce: 0.03,  // Reduced push for tighter grouping
      enclosureLeashForce: 0.08,
    };
  }

  /**
   * Color scheme: same as hierarchical
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
   * For module-class view: start with root nodes
   * User can click to expand and see child nodes
   */
  override filterNodesAndLinks(): void {
    const rootNodes = Array.from(this.allNodesMap.values())
      .filter(n => !n.parentId);

    this.nodes = rootNodes.map(n => this.createRenderNode(n));
    this.rebuildLinks();
  }
}

