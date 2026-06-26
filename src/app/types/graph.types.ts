/**
 * Graph-related Type Definitions
 * Defines all types used in graph visualization and data structures
 */

export type NodeType = 'DIRECTORY' | 'FILE' | 'CLASS' | 'FUNCTION' | 'METHOD';

export type LinkType = 'DEPENDENCY' | 'COUPLING' | 'CALL';

export type LinkDirection = 'fan-in' | 'fan-out';

/**
 * Represents a node in the graph
 */
export interface GraphNode {
  /** Unique identifier (path, file::class, etc) */
  id: string;

  /** Display label for the node */
  label: string;

  /** Node type categorization */
  type: NodeType;

  /** Parent node ID for hierarchical relationships */
  parentId?: string;

  /** Child nodes (only populated when needed) */
  children?: GraphNode[];

  /** Lines of code (if applicable) */
  loc?: number;

  /** X position for rendering */
  x?: number;

  /** Y position for rendering */
  y?: number;

  /** Depth in hierarchy */
  depth?: number;

  /** Size/radius for visualization */
  size?: number;

  /** Color for visualization */
  color?: string;
}

/**
 * Represents a link/edge between nodes
 */
export interface GraphLink {
  /** Source node ID */
  source: string;

  /** Target node ID */
  target: string;

  /** Link strength/weight for simulation */
  value: number;

  /** Link categorization */
  type: LinkType;

  /** Direction if applicable */
  direction?: LinkDirection;

  /** Actual fan-in count from metrics */
  fanIn?: number;

  /** Actual fan-out count from metrics */
  fanOut?: number;

  /** Real coupling intensity */
  couplingValue?: number;

  /** Aggregation level: 'file' (default, individual imports) or 'module' (deduplicated by directory) */
  level?: 'file' | 'module';
}

/**
 * Complete hierarchical graph data structure
 */
export interface HierarchicalData {
  /** All nodes in the graph */
  nodes: GraphNode[];

  /** All links in the graph */
  links: GraphLink[];
}

/**
 * Render-specific node data (includes D3 simulation data)
 */
export interface RenderNode extends GraphNode {
  /** Radius for rendering */
  r: number;

  /** Computed color */
  color: string;

  /** Original data node */
  data: GraphNode;

  /** D3 simulation vx */
  vx?: number;

  /** D3 simulation vy */
  vy?: number;

  /** D3 simulation x (final) */
  x: number;

  /** D3 simulation y (final) */
  y: number;
}

/**
 * Render-specific link data
 */
export interface RenderLink extends GraphLink {
  /** Computed opacity for rendering */
  opacity?: number;

  /** Computed width for rendering */
  width?: number;
}

/**
 * Enclosure bubble for folder visualization
 */
export interface Enclosure {
  /** Folder/parent node ID */
  id: string;

  /** Center X coordinate */
  x: number;

  /** Center Y coordinate */
  y: number;

  /** Radius */
  r: number;

  /** Display label */
  label: string;

  /** Fill color */
  color: string;
}
