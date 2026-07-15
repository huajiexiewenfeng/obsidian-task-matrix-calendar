export interface VaultProcessPort {
  exists(path: string): boolean;
  read(path: string): Promise<string>;
  create(path: string, source: string): Promise<void>;
  process(path: string, update: (source: string) => string): Promise<void>;
}
