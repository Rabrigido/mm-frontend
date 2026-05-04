/**
 * Metrics-related Type Definitions
 * Defines all types for metrics data from the backend
 */

/**
 * Generic metric data structure (can be nested)
 */
export type MetricData = Record<string, number | MetricData | MetricData[]>;

/**
 * File-level coupling metrics
 */
export interface FileCouplingData {
  [filePath: string]: {
    fanIn: number;
    fanOut: number;
    imports?: string[];
    exportedTo?: string[];
  };
}

/**
 * Class-level coupling metrics
 */
export interface ClassCouplingData {
  [className: string]: {
    methods?: Record<string, MethodCouplingMetrics>;
    fanIn?: number;
    fanOut?: number;
  };
}

/**
 * Method/function-level coupling metrics
 */
export interface MethodCouplingMetrics {
  fanIn: number;
  fanOut: number;
  callers?: string[];
  callees?: string[];
}

/**
 * Function-level coupling metrics
 */
export interface FunctionCouplingData {
  [functionName: string]: MethodCouplingMetrics;
}

/**
 * Files inventory data
 */
export interface FilesMetric {
  [filePath: string]: {
    extension: string;
    lines?: number;
    functions?: number;
    classes?: number;
  };
}

/**
 * Classes per file inventory
 */
export interface ClassesPerFileMetric {
  [filePath: string]: string[]; // array of class names
}

/**
 * Functions per file inventory
 */
export interface FunctionsPerFileMetric {
  [filePath: string]: Record<string, any>; // function names with their data
}

/**
 * Complete modularity metrics result
 */
export interface ModularityMetrics {
  'file-coupling'?: FileCouplingData;
  'class-coupling'?: ClassCouplingData;
  'function-coupling'?: FunctionCouplingData;
  'files'?: FilesMetric;
  'classes-per-file'?: ClassesPerFileMetric;
  'functions-per-file'?: FunctionsPerFileMetric;
  'errors'?: Record<string, any>;
  [key: string]: MetricData | undefined;
}

/**
 * Backend API response wrapper for metrics
 */
export interface MetricsApiResponse<T = MetricData> {
  result: T;
  status?: 'success' | 'error';
  message?: string;
}

/**
 * Complete metrics payload from backend
 */
export interface MetricsPayload {
  'files': MetricsApiResponse<FilesMetric>;
  'classes-per-file': MetricsApiResponse<ClassesPerFileMetric>;
  'functions-per-file': MetricsApiResponse<FunctionsPerFileMetric>;
  'file-coupling': MetricsApiResponse<FileCouplingData>;
  'class-coupling': MetricsApiResponse<ClassCouplingData>;
  'function-coupling': MetricsApiResponse<FunctionCouplingData>;
  [key: string]: MetricsApiResponse<any>;
}

/**
 * Chart data point for rendering
 */
export interface ChartDataPoint {
  name: string;
  value: number;
}

/**
 * Chart data structure for ECharts
 */
export interface ChartData {
  title?: string;
  categories: string[];
  values: number[];
  series: Array<{
    name: string;
    data: ChartDataPoint[];
  }>;
}
