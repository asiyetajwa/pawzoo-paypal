// Persistence. One JSON document per household: a local file by default, DynamoDB when PAWZOO_TABLE is set.

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
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

export class DynamoStore implements Store {
  readonly kind = 'dynamodb';
  private readonly doc: DynamoDBDocumentClient;

  constructor(private readonly table: string, region?: string) {
    this.doc = DynamoDBDocumentClient.from(new DynamoDBClient(region ? { region } : {}));
  }

  async load(householdId: string): Promise<State | null> {
    const out = await this.doc.send(new GetCommand({ TableName: this.table, Key: { householdId } }));
    const body = out.Item?.state as string | undefined;
    return body ? (JSON.parse(body) as State) : null;
  }

  async save(state: State): Promise<void> {
    await this.doc.send(
      new PutCommand({
        TableName: this.table,
        Item: { householdId: state.household.id, state: JSON.stringify(state), updatedAt: new Date().toISOString() },
      }),
    );
  }
}

export function storeFromEnv(): Store {
  const table = process.env.PAWZOO_TABLE;
  if (table) return new DynamoStore(table, process.env.AWS_REGION);
  return new FileStore(process.env.PAWZOO_STATE_FILE ?? 'data/state.json');
}
