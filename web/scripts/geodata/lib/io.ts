import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export function readJson<T>(p: string): T {
  return JSON.parse(readFileSync(p, 'utf8')) as T;
}

export function writeJson(p: string, v: unknown): void {
  mkdirSync(path.dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(v, null, 1) + '\n');
}

export function writeBytes(p: string, b: Uint8Array): void {
  mkdirSync(path.dirname(p), { recursive: true });
  writeFileSync(p, b);
}
