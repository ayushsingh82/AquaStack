import 'server-only';
import { privateKeyToAccount } from 'viem/accounts';
import type { Address } from 'viem';
import { LocalKeySigner, type PositionSigner } from '../keeper';
import { publicClient, RPC_URL } from './client';
import { privySessionSigner, privyConfigured } from './privy-signer';
import type { PositionRecord } from '../rules';

/**
 * signerFor() for the app's keeper. In priority order:
 *   1. the user's Privy embedded wallet, if they delegated it for this position
 *      (`record.sessionSignerRef`) — the real non-custodial "act while offline" path
 *   2. a local `KEEPER_PRIVATE_KEY` — the demo keeper (anvil account 0 on a fork)
 *   3. nothing → keeper is alert-only for this position
 */
function accountFromEnv() {
  const pk = process.env.KEEPER_PRIVATE_KEY;
  if (!pk) return null;
  return privateKeyToAccount(pk.startsWith('0x') ? (pk as `0x${string}`) : (`0x${pk}` as `0x${string}`));
}

export function keeperSignerFor(record: PositionRecord): PositionSigner | null {
  if (record.sessionSignerRef) {
    const s = privySessionSigner(record.sessionSignerRef as Address);
    if (s) return s;
  }
  const account = accountFromEnv();
  if (account) return new LocalKeySigner(account, RPC_URL, publicClient);
  return null;
}

/** Task 22 — what the keeper can sign with, for the console. */
export function keeperSignerInfo(): {
  kind: 'privy-session' | 'local-key' | 'none';
  address?: string;
  privyAvailable: boolean;
} {
  const account = accountFromEnv();
  return {
    kind: account ? 'local-key' : 'none',
    address: account?.address,
    privyAvailable: privyConfigured(),
  };
}
