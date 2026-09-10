import 'server-only';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { Redis } from '@upstash/redis';
import type { TickResult, KeeperRun } from '../keeper/types';

/**
 * Task 21 — a tiny append-only log of keeper runs so the console can show a
 * history across page loads. Redis list on Vercel (same Upstash creds as the
 * position store), a JSON file locally. Last `MAX` runs are kept.
 */
export type { KeeperRun };

const MAX = 50;
const KEY = 'aqua:keeper:runs';

const redisUrl = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
const redis = redisUrl && redisToken ? new Redis({ url: redisUrl, token: redisToken }) : null;

const LOG_PATH = process.env.KEEPER_LOG_PATH
  ? path.resolve(process.cwd(), process.env.KEEPER_LOG_PATH)
  : path.join(process.cwd(), '.data', 'keeper-log.json');

async function fileReadAll(): Promise<KeeperRun[]> {
  try {
    return JSON.parse(await fs.readFile(LOG_PATH, 'utf8')) as KeeperRun[];
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw e;
  }
}

/** newest first */
export async function listKeeperRuns(limit = MAX): Promise<KeeperRun[]> {
  if (redis) {
    // stored newest-first via lpush
    return (await redis.lrange<KeeperRun>(KEY, 0, limit - 1)) ?? [];
  }
  return (await fileReadAll()).slice(-limit).reverse();
}

export async function appendKeeperRun(results: TickResult[]): Promise<KeeperRun> {
  const run: KeeperRun = { at: Date.now(), ticked: results.length, results };
  if (redis) {
    await redis.lpush(KEY, run);
    await redis.ltrim(KEY, 0, MAX - 1);
    return run;
  }
  const all = await fileReadAll();
  all.push(run);
  await fs.mkdir(path.dirname(LOG_PATH), { recursive: true });
  await fs.writeFile(LOG_PATH, JSON.stringify(all.slice(-MAX), null, 2));
  return run;
}
