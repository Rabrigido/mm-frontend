
# Feature: Multi-Granularity Dependency Visualization

## Overview

This feature introduces dynamic dependency graph visualization where "fan-in" (inbound dependencies) and "fan-out" (outbound dependencies) behave differently depending on the architectural level being viewed.

While classes and functions will maintain their classic behavior (tracking direct instantiation and execution calls), Files and Modules will use a specialized import-based connection strategy.

## Connection Strategies

### 1. Modules (High-Level Granularity)

At the module level, dependencies are deduplicated to show unique relationships between architectural boundaries.

* **Fan-out:** The number of unique external modules that this module depends on.
* **Fan-in:** The number of external modules that depend on this module.

### 2. Files (Mid-Level Granularity)

At the file level, dependencies represent the exact number of import statements targeting distinct external assets.

* **Fan-out:** The total number of imports made by the file.
* **Fan-in:** The total number of times this file is imported by others.

### 3. Classes and Functions (Low-Level Granularity)

* Maintains the classic behavior: edges represent direct execution calls (for functions) or object instantiations/inheritance (for classes).

 

## Data Source & Implementation

To generate the File and Module graphs, the visualization will consume the pre-calculated `file-coupling` metric data available in the system JSON, you can use file-coupling to determine the module dependencies as a modules / package are a group of files in the same dir, you can use regex also to determine the module level.

### Expected JSON Structure

The parser will analyze the `fanOut` and `fanIn` path arrays to draw the edges and aggregate them for the Module-level view:

```json
{
  "name": "File Coupling",
  "description": "Measures file-level coupling by computing each file’s fan-in (dependent files) and fan-out (dependencies)",
  "result": {
    "/path/to/app.ts": {
      "fanOut": ["/path/to/utils/index.ts"],
      "fanIn": []
    },
    "/path/to/utils/index.ts": {
      "fanOut": [],
      "fanIn": ["/path/to/app.ts"]
    }
  },
  "status": true
}

```