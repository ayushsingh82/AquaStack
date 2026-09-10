/**
 * Phase 2, piece 2 — the position/rule store.
 *
 * Keyed by `${user}:${strategyHash}` (lowercased). Implementations:
 *   - MemoryRuleStore   — tests, ephemeral
 *   - JsonFileRuleStore — a single JSON file — local dev
 *   - RedisRuleStore    — Upstash Redis (REST) — Vercel / any serverless host
 *
 * All share the `RuleStore` interface; `src/lib/server/store.ts` picks one.
 */
import { promises as fs } from 'node:fs';
import { dirname } from 'node:path';
import { Redis } from '@upstash/redis';
import type { Address, Hex } from 'viem';
import type { PositionRecord, RuleStore } from './types';

const key = (user: Address, strategyHash: Hex) => `${user.toLowerCase()}:${strategyHash.toLowerCase()}`;

function matches(rec: PositionRecord, filter?: { status?: PositionRecord['status']; user?: Address }): boolean {
  if (!filter) return true;
  if (filter.status && rec.status !== filter.status) return false;
  if (filter.user && rec.user.toLowerCase() !== filter.user.toLowerCase()) return false;
  return true;
}

// ---- bigint-safe JSON ----
const replacer = (_k: string, v: unknown) => (typeof v === 'bigint' ? { $bigint: v.toString() } : v);
const reviver = (_k: string, v: unknown) =>
  v && typeof v === 'object' && '$bigint' in v && typeof (v as { $bigint: unknown }).$bigint === 'string'
    ? BigInt((v as { $bigint: string }).$bigint)
    : v;

export class MemoryRuleStore implements RuleStore {
  private readonly map = new Map<string, PositionRecord>();

  async get(user: Address, strategyHash: Hex): Promise<PositionRecord | null> {
    return this.map.get(key(user, strategyHash)) ?? null;
  }
  async put(record: PositionRecord): Promise<void> {
    this.map.set(key(record.user, record.strategyHash), { ...record });
  }
  async update(user: Address, strategyHash: Hex, patch: Partial<PositionRecord>): Promise<PositionRecord> {
    const k = key(user, strategyHash);
    const cur = this.map.get(k);
    if (!cur) throw new Error(`no record for ${k}`);
    const next = { ...cur, ...patch };
    this.map.set(k, next);
    return next;
  }
  async list(filter?: { status?: PositionRecord['status']; user?: Address }): Promise<PositionRecord[]> {
    return [...this.map.values()].filter((r) => matches(r, filter));
  }
  async delete(user: Address, strategyHash: Hex): Promise<void> {
    this.map.delete(key(user, strategyHash));
  }
}

export class JsonFileRuleStore implements RuleStore {
  constructor(private readonly path: string) {}

  private async readAll(): Promise<Record<string, PositionRecord>> {
    try {
      return JSON.parse(await fs.readFile(this.path, 'utf8'), reviver) as Record<string, PositionRecord>;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return {};
      throw e;
    }
  }
  private async writeAll(all: Record<string, PositionRecord>): Promise<void> {
    await fs.mkdir(dirname(this.path), { recursive: true });
    await fs.writeFile(this.path, JSON.stringify(all, replacer, 2));
  }

  async get(user: Address, strategyHash: Hex): Promise<PositionRecord | null> {
    return (await this.readAll())[key(user, strategyHash)] ?? null;
  }
  async put(record: PositionRecord): Promise<void> {
    const all = await this.readAll();
    all[key(record.user, record.strategyHash)] = record;
    await this.writeAll(all);
  }
  async update(user: Address, strategyHash: Hex, patch: Partial<PositionRecord>): Promise<PositionRecord> {
    const all = await this.readAll();
    const k = key(user, strategyHash);
    if (!all[k]) throw new Error(`no record for ${k}`);
    all[k] = { ...all[k], ...patch };
    await this.writeAll(all);
    return all[k];
  }
  async list(filter?: { status?: PositionRecord['status']; user?: Address }): Promise<PositionRecord[]> {
    return Object.values(await this.readAll()).filter((r) => matches(r, filter));
  }
  async delete(user: Address, strategyHash: Hex): Promise<void> {
    const all = await this.readAll();
    delete all[key(user, strategyHash)];
    await this.writeAll(all);
  }
}

/**
 * Upstash Redis (REST) store — works on Vercel / any serverless host where the
 * filesystem is read-only. Records are stored bigint-safe as JSON strings under
 * `aqua:pos:<key>`, with an index set `aqua:pos:index` for list().
 */
export class RedisRuleStore implements RuleStore {
  private readonly r: Redis;
  private readonly INDEX = 'aqua:pos:index';
  constructor(url: string, token: string) {
    // keep our bigint-safe JSON strings intact — we parse/serialize ourselves
    this.r = new Redis({ url, token, automaticDeserialization: false });
  }
  private k(user: Address, strategyHash: Hex) {
    return `aqua:pos:${key(user, strategyHash)}`;
  }
  private enc(rec: PositionRecord) {
    return JSON.stringify(rec, replacer);
  }
  private dec(s: string | null): PositionRecord | null {
    return s ? (JSON.parse(s, reviver) as PositionRecord) : null;
  }

  async get(user: Address, strategyHash: Hex): Promise<PositionRecord | null> {
    return this.dec(await this.r.get<string>(this.k(user, strategyHash)));
  }
  async put(record: PositionRecord): Promise<void> {
    const k = this.k(record.user, record.strategyHash);
    await this.r.set(k, this.enc(record));
    await this.r.sadd(this.INDEX, k);
  }
  async update(user: Address, strategyHash: Hex, patch: Partial<PositionRecord>): Promise<PositionRecord> {
    const cur = await this.get(user, strategyHash);
    if (!cur) throw new Error(`no record for ${key(user, strategyHash)}`);
    const next = { ...cur, ...patch };
    await this.r.set(this.k(user, strategyHash), this.enc(next));
    return next;
  }
  async list(filter?: { status?: PositionRecord['status']; user?: Address }): Promise<PositionRecord[]> {
    const keys = await this.r.smembers(this.INDEX);
    if (keys.length === 0) return [];
    const raw = await this.r.mget<string[]>(...keys);
    return raw
      .map((s) => this.dec(s))
      .filter((r): r is PositionRecord => r !== null && matches(r, filter));
  }
  async delete(user: Address, strategyHash: Hex): Promise<void> {
    const k = this.k(user, strategyHash);
    await this.r.del(k);
    await this.r.srem(this.INDEX, k);
  }
}
