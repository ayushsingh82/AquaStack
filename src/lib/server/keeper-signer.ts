import 'server-only';
import { privateKeyToAccount } from 'viem/accounts';
import { LocalKeySigner, type PositionSigner } from '../keeper';
import { publicClient, RPC_URL } from './client';
import type { PositionRecord } from '../rules';

/**
 * signerFor() for the app's keeper.
 *
 * Demo: a single `KEEPER_PRIVATE_KEY` acts for every position (the maker in the
 * fork tests is anvil account 0). Production: look up the user's Privy session
 * signer here instead and return a PositionSigner backed by it — same interface.
 * No key configured → returns null → keeper falls back to alert-only.
 */
function accountFromEnv() {
  const pk = process.env.KEEPER_PRIVATE_KEY;
  if (!pk) return null;
  return privateKeyToAccount(pk.startsWith('0x') ? (pk as `0x${string}`) : (`0x${pk}` as `0x${string}`));
}

export function keeperSignerFor(_rec: PositionRecord): PositionSigner | null {
  const account = accountFromEnv();
  if (!account) return null;
  return new LocalKeySigner(account, RPC_URL, publicClient);
}

/** Task 22 — what the keeper can sign with right now, for the console. */
export function keeperSignerInfo(): { kind: 'local-key' | 'none'; address?: string } {
  const account = accountFromEnv();
  return account ? { kind: 'local-key', address: account.address } : { kind: 'none' };
}
