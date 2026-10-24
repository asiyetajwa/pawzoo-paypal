// Loads the repo-root .env and makes it win over variables already set in the shell or in Windows,
// so the settings you see in .env are the settings Pawzoo uses. Prints any value it overrides.

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const ENV_FILE = process.env.PAWZOO_ENV_FILE ?? join(root, '.env');

export function loadEnv(file = ENV_FILE): { loaded: boolean; overridden: string[] } {
  if (!existsSync(file)) return { loaded: false, overridden: [] };
  const overridden: string[] = [];
  for (const raw of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    const before = process.env[key];
    if (before !== undefined && before !== value) {
      overridden.push(`${key}: using "${value}" from .env instead of "${before}" from your system environment`);
    }
    process.env[key] = value;
  }
  return { loaded: true, overridden };
}

const result = loadEnv();
for (const line of result.overridden) console.warn(`[env] ${line}`);
console.log(result.loaded ? `[env] Settings from ${ENV_FILE}` : `[env] No .env at ${ENV_FILE}: using system environment only`);
