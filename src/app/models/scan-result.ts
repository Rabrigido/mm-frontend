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
// If you plug in your Modularity Metrics lib, attach its raw output here
modularityMetrics?: unknown;
}
