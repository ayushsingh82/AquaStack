/** Shared chain config. Base mainnet (8453) or Base Sepolia (84532),
 *  with the RPC pointed wherever NEXT_PUBLIC_RPC_URL says (fork, hosted, or public). */
import { defineChain } from 'viem';
import { base, baseSepolia } from 'viem/chains';

export const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 8453);

/** client-safe RPC url (inlined at build); server code should prefer process.env.RPC_URL */
export const PUBLIC_RPC_URL = process.env.NEXT_PUBLIC_RPC_URL ?? 'http://127.0.0.1:8545';

const template = CHAIN_ID === baseSepolia.id ? baseSepolia : base;

export const forkChain = defineChain({
  ...template,
  id: CHAIN_ID,
  name:
    CHAIN_ID === baseSepolia.id
      ? 'Base Sepolia'
      : CHAIN_ID === base.id
        ? 'Base'
        : `Base fork (${CHAIN_ID})`,
  rpcUrls: {
    default: { http: [PUBLIC_RPC_URL] },
    public: { http: [PUBLIC_RPC_URL] },
  },
});
