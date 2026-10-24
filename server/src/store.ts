// Persistence. One JSON document per household, in a local file (writes go through a temp file, then a rename).

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { State } from './types.js';

export interface Store {
  readonly kind: string;
  load(householdId: string): Promise<State | null>;
  save(state: State): Promise<void>;
}

export class FileStore implements Store {
  readonly kind = 'file';
  constructor(private readonly path: string) {}

  async load(): Promise<State | null> {
    try {
      return JSON.parse(await readFile(this.path, 'utf8')) as State;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw err;
    }
  }

  async save(state: State): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    const tmp = `${this.path}.tmp`;
    await writeFile(tmp, JSON.stringify(state, null, 2));
    await rename(tmp, this.path);
  }
}

export function storeFromEnv(): Store {
  return new FileStore(process.env.PAWZOO_STATE_FILE ?? 'data/state.json');
}
