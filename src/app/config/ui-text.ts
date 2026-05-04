/**
 * UI Text Constants
 * Centralized text strings for the application
 * Makes it easy to maintain translations and consistent messaging
 */

export const UI_TEXT = {
  REPOS: {
    ADD_LABEL: 'Agregar repo por URL (git)',
    ADD_PLACEHOLDER: 'https://github.com/usuario/proyecto.git',
    DELETE_CONFIRM: '¿Eliminar este repo del servidor?',
    LOADING: 'Cargando...',
    ERROR_ADD: 'No se pudo agregar',
    ERROR_DELETE: 'No se pudo eliminar',
    SCAN_RUNNING: 'Escaneo en progreso...',
  },

  METRICS: {
    CLASS_COUPLING: 'class-coupling',
    FILE_COUPLING: 'file-coupling',
    FUNCTION_COUPLING: 'function-coupling',
    CLASSES_PER_FILE: 'classes-per-file',
    FUNCTIONS_PER_FILE: 'functions-per-file',
    FILES: 'files',
    ERRORS: 'errors',
  },

  CHARTS: {
    MAX_ITEMS: 20,
    COLOR_SCALE_DIVISOR: 10,
    EMPTY_MESSAGE: 'No hay datos disponibles',
    ERROR_RENDERING: 'Error al renderizar el gráfico',
  },

  PANELS: {
    FILE_COUPLING: 'File Coupling',
    HIERARCHICAL: 'Hierarchical Graph',
    CLASS_GRAPH: 'Class Graph',
    FUNCTION_GRAPH: 'Function Graph',
    METRICS: 'Métricas',
    JSON: 'JSON',
    CHARTS: 'Gráficos',
  },

  ERRORS: {
    LOAD_REPO: 'Error cargando repositorio',
    LOAD_METRICS: 'Error cargando métricas',
    LOAD_GRAPH: 'Error cargando gráfico',
  },
};

/**
 * Metric field names for chart data extraction
 * Used to identify numeric fields when building charts
 */
export const METRIC_FIELD_NAMES = {
  // Fields to check when building charts (order matters for priority)
  NUMERIC: ['count', 'fanIn', 'fanOut', 'size', 'lines', 'total', 'degree'],
  // Maximum items to display in charts
  MAX_CHART_ITEMS: 20,
};

/**
 * Metric path shortcuts
 * Map friendly names to actual metric paths
 */
export const METRIC_PATHS = {
  FILES: 'files',
  CLASSES: 'classes-per-file',
  FUNCTIONS: 'functions-per-file',
  FILE_COUPLING: 'file-coupling',
  CLASS_COUPLING: 'class-coupling',
  FUNCTION_COUPLING: 'function-coupling',
};
