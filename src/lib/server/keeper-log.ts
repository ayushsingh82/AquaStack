import 'server-only';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { TickResult, KeeperRun } from '../keeper/types';

/**
 * Task 21 — a tiny append-only log of keeper runs, so the console can show a
 * history of ticks / alerts / unwinds across page loads. One JSON file next to
 * the position store; last `MAX` runs are kept. Swap for a table with Postgres.
 */
export type { KeeperRun };

const MAX = 50;

const LOG_PATH = process.env.KEEPER_LOG_PATH
  ? path.resolve(process.cwd(), process.env.KEEPER_LOG_PATH)
  : path.join(process.cwd(), '.data', 'keeper-log.json');

async function readAll(): Promise<KeeperRun[]> {
  try {
    return JSON.parse(await fs.readFile(LOG_PATH, 'utf8')) as KeeperRun[];
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw e;
  }
}

/** newest first */
export async function listKeeperRuns(limit = MAX): Promise<KeeperRun[]> {
  const all = await readAll();
  return all.slice(-limit).reverse();
}

export async function appendKeeperRun(results: TickResult[]): Promise<KeeperRun> {
  const run: KeeperRun = { at: Date.now(), ticked: results.length, results };
  const all = await readAll();
  all.push(run);
  await fs.mkdir(path.dirname(LOG_PATH), { recursive: true });
  await fs.writeFile(LOG_PATH, JSON.stringify(all.slice(-MAX), null, 2));
  return run;
}
