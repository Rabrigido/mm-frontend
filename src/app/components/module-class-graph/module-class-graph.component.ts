import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import * as d3 from 'd3';
import { BaseGraphComponent, PhysicsConfig, Enclosure } from '../base-graph.component';
import { D3_CONFIG } from '../../config/d3-config';
import { NodeType } from '../../types/graph.types';
import { graphs, colors } from '../../design-system';
import { GraphTreeModalComponent } from '../graph-tree-modal/graph-tree-modal.component';

@Component({
  selector: 'app-module-class-graph',
  standalone: true,
  imports: [CommonModule, GraphTreeModalComponent],
  templateUrl: './module-class-graph.component.html',
  styleUrls: ['./module-class-graph.component.css']
})
/**
 * Class-level coupling graph. Shows files and their classes with coupling links.
 * Overrides calculateEnclosures to include ALL descendants and rebuildLinks to
 * use fan-in + fan-out for link value intensity.
 */
export class ModuleClassGraphComponent extends BaseGraphComponent {
  // Design System
  graphs = graphs;
  colors = colors;
  showTreeModal = signal(false);

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
    const hidden = this.hiddenNodes();
    const rootNodes = Array.from(this.allNodesMap.values())
      .filter(n => !n.parentId && !hidden.has(n.id));

    this.nodes = rootNodes.map(n => this.createRenderNode(n));
    this.rebuildLinks();
  }

  /**
   * Enclosure calculation: include ALL descendants (not just direct children)
   * so that deeply nested nodes are properly wrapped inside parent bubbles.
   */
  override calculateEnclosures(): Enclosure[] {
    const enclosures: Enclosure[] = [];
    const colorScheme = this.getColorScheme();

    this.expandedNodes.forEach(parentId => {
      const descendants = this.nodes.filter(n => this.isDescendant(n.id, parentId));

      if (descendants.length > 0) {
        const pData = this.allNodesMap.get(parentId);
        const circle = d3.packEnclose(descendants as any);
        if (circle) {
          enclosures.push({
            id: parentId,
            x: circle.x,
            y: circle.y,
            r: circle.r + D3_CONFIG.ENCLOSURE.PADDING,
            label: pData?.label || '',
            color: colorScheme[pData?.type as NodeType] || '#ccc'
          });
        }
      }
    });

    return enclosures;
  }

  /**
   * Rebuild links using actual coupling (fan-in + fan-out) for link value,
   * so link color intensity reflects real dependency strength.
   */
  override rebuildLinks(): void {
    const visibleNodeIds = new Set(this.nodes.map(n => n.id));
    const visibleNodeMap = new Map(this.nodes.map(n => [n.id, n]));
    const newLinks = new Map<string, any>();

    const findVisible = (id: string): string | undefined => {
      if (visibleNodeIds.has(id)) return id;
      let curr = this.allNodesMap.get(id);
      while (curr && curr.parentId) {
        if (visibleNodeIds.has(curr.parentId)) return curr.parentId;
        curr = this.allNodesMap.get(curr.parentId);
      }
      return undefined;
    };

    this.allLinks.forEach(l => {
      const sourceId = findVisible(l.source as string);
      const targetId = findVisible(l.target as string);
      if (sourceId && targetId && sourceId !== targetId) {
        const key = `${sourceId}->${targetId}`;
        const couplingValue = (l.fanIn ?? 0) + (l.fanOut ?? 0);
        if (!newLinks.has(key)) {
          newLinks.set(key, {
            source: visibleNodeMap.get(sourceId)!,
            target: visibleNodeMap.get(targetId)!,
            value: couplingValue || l.value || 1,
          });
        } else {
          newLinks.get(key)!.value += couplingValue || l.value || 1;
        }
      }
    });

    this.links = Array.from(newLinks.values());
  }
}

