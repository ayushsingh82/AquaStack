/**
 * Side-effect module: load .env + deployments/<chainId>.json into process.env
 * before any lib module reads them. tsx does not auto-load .env, and
 * src/lib/aqua/constants.ts switches addresses on NEXT_PUBLIC_CHAIN_ID at import
 * time — so this must be imported FIRST in every fork script.
 */
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '..');

try {
  const envFile = readFileSync(path.join(root, '.env'), 'utf8');
  for (const line of envFile.split('\n')) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
} catch {
  /* no .env — fine */
}

const chainId = process.env.NEXT_PUBLIC_CHAIN_ID || '84532';
process.env.NEXT_PUBLIC_CHAIN_ID = chainId;

const dep = path.join(root, 'deployments', `${chainId}.json`);
if (existsSync(dep)) {
  const d = JSON.parse(readFileSync(dep, 'utf8')) as { aqua?: string; aquaSwapVMRouter?: string };
  if (d.aqua) process.env.NEXT_PUBLIC_AQUA = d.aqua;
  if (d.aquaSwapVMRouter) process.env.NEXT_PUBLIC_AQUA_SWAP_VM_ROUTER = d.aquaSwapVMRouter;
}
