export interface BundleResult {
  code: string;
  min: number;
  gzip: number;
  brotli: number;
}

export interface SizeCase {
  name: string;
  entry: string;
  limit: number;
}

export function workspace(): { name: string; setup(build: unknown): void };
export function bundle(contents: string): Promise<BundleResult>;
export const CASES: SizeCase[];
