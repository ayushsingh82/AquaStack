import 'server-only';
import { PrivyClient } from '@privy-io/server-auth';
import type { Address, Hex } from 'viem';
import { publicClient } from './client';
import { CHAIN_ID } from '@/lib/aqua/constants';
import type { PositionSigner } from '@/lib/keeper';
import type { TxStep } from '@/lib/aqua/types';

let cached: PrivyClient | null | undefined;

function client(): PrivyClient | null {
  if (cached !== undefined) return cached;
  const id = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  const secret = process.env.PRIVY_APP_SECRET;
  cached = id && secret ? new PrivyClient(id, secret) : null;
  return cached;
}

export function privyConfigured(): boolean {
  return client() !== null;
}

/**
 * A keeper signer backed by the user's Privy embedded wallet, which the user
 * delegated to the app (`useDelegatedActions().delegateWallet`). The keeper
 * server broadcasts `dock()` / `Aave.withdraw()` from that wallet while the
 * user is offline — the headline "auto-exit on depeg" flow.
 */
export function privySessionSigner(walletAddress: Address): PositionSigner | null {
  const privy = client();
  if (!privy) return null;

  return {
    address: walletAddress,
    async sendStep(step: TxStep): Promise<Hex> {
      const { hash } = await privy.walletApi.ethereum.sendTransaction({
        address: walletAddress,
        chainType: 'ethereum',
        caip2: `eip155:${CHAIN_ID}`,
        transaction: {
          to: step.to,
          data: step.data,
          value: step.value ? `0x${step.value.toString(16)}` : undefined,
          chainId: CHAIN_ID,
          gasLimit: 3_000_000,
        },
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash: hash as Hex });
      if (receipt.status !== 'success') throw new Error(`unwind step reverted: ${step.label}`);
      return hash as Hex;
    },
  };
}
