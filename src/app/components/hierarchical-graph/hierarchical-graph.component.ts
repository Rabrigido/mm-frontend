import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BaseGraphComponent, PhysicsConfig } from '../base-graph.component';
import { D3_CONFIG } from '../../config/d3-config';
import { graphs, colors } from '../../design-system';
import { GraphWrapperComponent, LegendItem } from '../graph-wrapper/graph-wrapper.component';

@Component({
  selector: 'app-hierarchical-graph',
  standalone: true,
  imports: [CommonModule, GraphWrapperComponent],
  templateUrl: './hierarchical-graph.component.html',
  styleUrls: ['./hierarchical-graph.component.css']
})
export class HierarchicalGraphComponent extends BaseGraphComponent {
  graphs = graphs;
  colors = colors;
  showTreeModal = signal(false);

  legendItems: LegendItem[] = [
    { colorClass: graphs.node.folder, label: 'Folder' },
    { colorClass: graphs.node.file, label: 'File' },
    { colorClass: graphs.node.class, label: 'Class' },
    { colorClass: graphs.node.function, label: 'Function' },
  ];

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

  override getColorScheme(): Record<string, string> {
    return { ...colors.visualizationHex };
  }

  override getRadiusScheme(): Record<string, number> {
    return {
      DIRECTORY: 35,
      FILE: 20,
      CLASS: 12,
      FUNCTION: 6,
      MODULE: 20
    };
  }

  override filterNodesAndLinks(): void {
    const hidden = this.hiddenNodes();
    const rootNodes = Array.from(this.allNodesMap.values())
      .filter(n => !n.parentId && !hidden.has(n.id));

    this.nodes = rootNodes.map(n => this.createRenderNode(n));
    this.rebuildLinks();
  }
}
