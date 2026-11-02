export interface CfLike {
  origin: string;
  swap(dir: string): void;
  down(value: boolean): void;
  failNext(path: string, times?: number, status?: number): void;
  hold(path: string): () => void;
  redirect(path: string, to: string): void;
  count(method: string, path: string): number;
  close(): Promise<void>;
}
export function startCfLike(options: { dir: string }): Promise<CfLike>;
