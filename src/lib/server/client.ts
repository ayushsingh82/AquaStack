import 'server-only';
import { createPublicClient, http } from 'viem';

const RPC_URL = process.env.RPC_URL ?? process.env.NEXT_PUBLIC_RPC_URL ?? 'http://127.0.0.1:8545';

/**
 * shared read client for the Aqua lib (server only).
 * No `chain` set on purpose — the lib functions only do reads, and a
 * chain-typed client (Base has OP-stack block formatters) doesn't assign to the
 * generic `PublicClient` the lib expects.
 */
export const publicClient = createPublicClient({
  transport: http(RPC_URL, { timeout: 30_000, retryCount: 3 }),
});

export { RPC_URL };
