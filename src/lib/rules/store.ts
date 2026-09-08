/**
 * Phase 2, piece 2 — the position/rule store.
 *
 * Keyed by `${user}:${strategyHash}` (lowercased). Two implementations:
 *   - MemoryRuleStore  — tests, ephemeral
 *   - JsonFileRuleStore — a single JSON file, good enough for the hackathon keeper
 *
 * Swap in Postgres later behind the same `RuleStore` interface.
 */
import { promises as fs } from 'node:fs';
import { dirname } from 'node:path';
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
