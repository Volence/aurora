import { readFile } from 'fs/promises';
import { resolve } from 'path';

export async function readBinaryFile(basePath: string, relativePath: string): Promise<Buffer> {
  const fullPath = resolve(basePath, relativePath);
  return readFile(fullPath);
}
