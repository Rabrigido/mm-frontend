# Graph Entities Tree Modal Plan

## Objective
Add a modal inside the graph visualization that shows a hierarchical tree view of all graph components (directories, files, classes, functions/methods). Enables users to browse and explore the codebase entity structure in a tree format alongside the force-directed graph.

## Architecture

### New Component
- **`GraphTreeModalComponent`** (`src/app/components/graph-tree-modal/`)
  - Self-contained modal + tree view
  - Receives all graph nodes via `@Input()`
  - Builds a flat display list from the hierarchy for rendering
  - Search/filter functionality
  - Expand/collapse tree branches
  - Uses existing Tailwind design system patterns

### Modified Components
1. **`BaseGraphComponent`** — Expose `allNodesMap` as public for template access
2. **All 3 graph components** — Add import, button, and modal component to each template

## File Changes

### New Files (2)
| File | Purpose |
|---|---|
| `src/app/components/graph-tree-modal/graph-tree-modal.component.ts` | Component logic: tree builder, expand/collapse, search filter, modal toggle |
| `src/app/components/graph-tree-modal/graph-tree-modal.component.html` | Modal overlay + tree view template |

### Modified Files (7)
| File | Change |
|---|---|
| `src/app/components/base-graph.component.ts` | Change `allNodesMap` from `protected` to `public` |
| `src/app/components/hierarchical-graph/hierarchical-graph.component.ts` | Import + register component |
| `src/app/components/hierarchical-graph/hierarchical-graph.component.html` | Add "Tree" button + modal tag |
| `src/app/components/module-class-graph/module-class-graph.component.ts` | Import + register component |
| `src/app/components/module-class-graph/module-class-graph.component.html` | Add "Tree" button + modal tag |
| `src/app/components/module-function-graph/module-function-graph.component.ts` | Import + register component |
| `src/app/components/module-function-graph/module-function-graph.component.html` | Add "Tree" button + modal tag |

## Commit Strategy

### Commit 1: Create GraphTreeModalComponent
- Create `graph-tree-modal/` directory with `.ts` and `.html` files
- Full modal + tree view implementation

### Commit 2: Expose allNodesMap in BaseGraphComponent
- Change visibility from `protected` to `public`

### Commit 3: Add tree modal to all 3 graph components
- Import component in each `.ts`
- Add button and modal tag in each `.html`

 