export interface Repo {
  id: string;                // ej: "23a753c2-2176-4745-b140-f5cd530a72a8"
  name: string;              // opcional según tu backend
  codePath?: string;         // donde quedó clonado
  scannedAt?: string;        // ISO string
  fullName: string;
  stats?: {
    files: number;
    lines: number;
    imports: number;
    exports: number;
    byExtension?: Record<string, number>;
  };
}
