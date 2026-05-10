/** Repository metadata from the backend API. */
export interface Repo {
  id: string;
  name: string;
  codePath?: string;
  scannedAt?: string;
  fullName: string;
  stats?: {
    files: number;
    lines: number;
    imports: number;
    exports: number;
    byExtension?: Record<string, number>;
  };
}
