/** Shared chain config — Base, with the RPC pointed at our fork. */
import { defineChain } from 'viem';
import { base } from 'viem/chains';

export const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 8453);

/** client-safe RPC url (inlined at build); server code should prefer process.env.RPC_URL */
export const PUBLIC_RPC_URL = process.env.NEXT_PUBLIC_RPC_URL ?? 'http://127.0.0.1:8545';

export const forkChain = defineChain({
  ...base,
  id: CHAIN_ID,
  name: CHAIN_ID === base.id ? 'Base (fork)' : `Base fork (${CHAIN_ID})`,
  rpcUrls: {
    default: { http: [PUBLIC_RPC_URL] },
    public: { http: [PUBLIC_RPC_URL] },
  },
});
