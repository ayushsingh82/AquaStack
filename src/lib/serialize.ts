/**
 * bigint-safe serialization for passing data across the RSC / server-action
 * boundary to Client Components.
 *
 * Server:  return toClient(value)
 * Client:  const x = fromClient<Shape>(payload)
 */

const TAG = '$b';

export function toClient<T>(value: T): unknown {
  return JSON.parse(
    JSON.stringify(value, (_k, v) => (typeof v === 'bigint' ? { [TAG]: v.toString() } : v)),
  );
}

export function fromClient<T>(payload: unknown): T {
  return revive(payload) as T;
}

function revive(v: unknown): unknown {
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map(revive);
  const rec = v as Record<string, unknown>;
  if (typeof rec[TAG] === 'string') return BigInt(rec[TAG] as string);
  const out: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(rec)) out[k] = revive(val);
  return out;
}
