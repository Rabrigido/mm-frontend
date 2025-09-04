export interface ScanResult {
  repoId: string;
  scannedAt: string;   // ISO
  codePath: string;
  stats: {
    files: number;
    lines: number;
    imports: number;
    exports: number;
    byExtension: Record<string, number>;
  };
  modularityMetrics: {
    ['parse-errors']: string[];
    ['metric-errors']: string[];
    ['traverse-errors']: string[];
  };
}
