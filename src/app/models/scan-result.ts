/** Result of a repository scan, containing stats and optional modularity metrics. */
export interface ScanResult {
  repoId: string;
  scannedAt: string;
  codePath: string;
  stats: {
    files: number;
    lines: number;
    byExtension: Record<string, number>;
    imports: number;
    exports: number;
  };
  modularityMetrics?: unknown;
}
