/**
 * D3 Visualization Configuration
 * Centralized configuration for all D3-based graph components
 * Ensures consistent physics, layout, and visual behavior across all graphs
 */

export const D3_CONFIG = {
  // Viewport
  VIEWPORT: {
    DEFAULT_WIDTH: 2000,
    DEFAULT_HEIGHT: 800,
  },

  // Zoom controls
  ZOOM: {
    MIN: 0.1,
    MAX: 8,
  },

  // Force simulation physics
  PHYSICS: {
    HIERARCHICAL: {
      CHARGE_STRENGTH: -150,
      LINK_DISTANCE: 100,
      CENTER_STRENGTH: 0.06,
      COLLIDE_PADDING: 15,
      COLLIDE_ITERATIONS: 2,
    },
    MODULE_CLASS: {
      CHARGE_STRENGTH: -150,
      LINK_DISTANCE: 100,
      CENTER_STRENGTH: 0.06,
      COLLIDE_PADDING: 15,
      COLLIDE_ITERATIONS: 2,
    },
    MODULE_FUNCTION: {
      CHARGE_STRENGTH: -300,
      LINK_DISTANCE: 80,
      CENTER_STRENGTH: 0.06,
      COLLIDE_PADDING: 15,
      COLLIDE_ITERATIONS: 2,
    },
  },

  // Enclosures (folder bubbles)
  ENCLOSURE: {
    PADDING: 12,
    PUSH_FORCE: 0.1,
    LEASH_FORCE: 0.08,
    FILL_OPACITY: 0.04,
    STROKE_OPACITY: 0.35,
  },

  // Link visualization
  LINK: {
    OPACITY: 0.6,
    ARROW_ID: 'arrowhead',
    COLOR_MID: '#64748b',
  },

  // Node visualization
  NODE: {
    STROKE_WIDTH: 2,
    COLOR: {
      DIRECTORY: '#f59e0b', // Amber
      FILE: '#64748b', // Slate
      CLASS: '#ec4899', // Pink
      FUNCTION: '#8b5cf6', // Violet
    },
  },
};

/**
 * D3 Force builders - shared logic for creating forces
 */
export class D3ForceBuilder {
  /**
   * Creates a charge force for node repulsion
   */
  static createChargeForce(strength: number) {
    return { type: 'charge', strength };
  }

  /**
   * Creates a link force for edge constraints
   */
  static createLinkForce(distance: number) {
    return { type: 'link', distance };
  }

  /**
   * Creates a center force for gravity toward center
   */
  static createCenterForce(strength: number) {
    return { type: 'center', strength };
  }

  /**
   * Creates a collision force for preventing node overlap
   */
  static createCollideForce(radius: number, iterations: number) {
    return { type: 'collide', radius, iterations };
  }
}

/**
 * Color utilities for graph rendering
 */
export class D3ColorUtils {
  /**
   * Get node color based on type
   */
  static getNodeColor(type: string): string {
    return (D3_CONFIG.NODE.COLOR as Record<string, string>)[type] || '#94a3b8';
  }

  /**
   * Blend two colors for gradient effects
   * @param color1 First color (hex)
   * @param color2 Second color (hex)
   * @param ratio Blend ratio 0-1 (0 = color1, 1 = color2)
   */
  static blendColors(color1: string, color2: string, ratio: number): string {
    const c1 = parseInt(color1.substring(1), 16);
    const c2 = parseInt(color2.substring(1), 16);

    const r1 = (c1 >> 16) & 255;
    const g1 = (c1 >> 8) & 255;
    const b1 = c1 & 255;

    const r2 = (c2 >> 16) & 255;
    const g2 = (c2 >> 8) & 255;
    const b2 = c2 & 255;

    const r = Math.round(r1 + (r2 - r1) * ratio);
    const g = Math.round(g1 + (g2 - g1) * ratio);
    const b = Math.round(b1 + (b2 - b1) * ratio);

    return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
  }

  /**
   * Get link opacity based on coupling value
   */
  static getLinkOpacity(value: number, maxValue: number): number {
    const normalized = Math.min(value / maxValue, 1);
    return D3_CONFIG.LINK.OPACITY * (0.3 + 0.7 * normalized); // 0.18 to 0.6
  }
}
