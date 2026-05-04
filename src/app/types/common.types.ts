/**
 * Common Type Definitions
 * Shared types across the application
 */

/**
 * Repository data structure
 */
export interface Repo {
  /** Unique repository identifier */
  id: string;

  /** Repository name */
  name?: string;

  /** Full repository name (owner/repo) */
  fullName: string;

  /** Local code path */
  codePath?: string;

  /** Last scan timestamp */
  scannedAt?: string;

  /** Repository statistics */
  stats?: RepoStats;
}

/**
 * Repository statistics
 */
export interface RepoStats {
  /** Total number of files */
  files: number;

  /** Total lines of code */
  lines: number;

  /** Total number of imports */
  imports: number;

  /** Total number of exports */
  exports: number;

  /** File count by extension */
  byExtension?: Record<string, number>;

  /** Any other metrics */
  [key: string]: any;
}

/**
 * Scan result with metrics
 */
export interface ScanResult {
  /** Repository ID this scan belongs to */
  repoId: string;

  /** When the scan was performed */
  scannedAt: string;

  /** Path that was scanned */
  codePath: string;

  /** Repository statistics */
  stats: RepoStats;

  /** All modularity metrics */
  modularityMetrics?: Record<string, any>;
}

/**
 * API Response wrapper
 */
export interface ApiResponse<T> {
  data?: T;
  error?: string;
  status: 'success' | 'error';
  message?: string;
}

/**
 * Paginated API Response
 */
export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  total: number;
  page: number;
  pageSize: number;
}

/**
 * Error details
 */
export interface ErrorDetails {
  code: string;
  message: string;
  context?: Record<string, any>;
}
