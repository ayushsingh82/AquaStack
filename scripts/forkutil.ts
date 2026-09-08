/** Minimal Base-fork helpers for the Phase 1 lib fork-tests. */
import {
  createPublicClient, createWalletClient, http, keccak256, encodeAbiParameters,
  parseAbiParameters, pad, toHex, type Address, type Hex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { ERC20_ABI } from '../src/lib/aqua/constants';

export const RPC = process.env.RPC || 'http://127.0.0.1:8545';

export const pub = createPublicClient({ transport: http(RPC, { timeout: 60_000, retryCount: 5 }) });

const KEYS = [
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
  '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
] as const;
export const accounts = KEYS.map((k) => privateKeyToAccount(k));
export const wallets = accounts.map((a) => createWalletClient({ account: a, transport: http(RPC) }));

export const anvil = (method: string, params: unknown[]) =>
  pub.request({ method: method as any, params: params as any });

/** sign+send a raw call, assert it succeeds */
export async function sendStep(walletIdx: number, to: Address, data: Hex, label = ''): Promise<bigint> {
  try {
    const hash = await wallets[walletIdx].sendTransaction({ to, data, chain: null });
    const r = await pub.waitForTransactionReceipt({ hash });
    if (r.status !== 'success') throw new Error(`tx reverted${label ? ` (${label})` : ''}`);
    return r.gasUsed;
  } catch (e: any) {
    // surface the on-chain revert reason
    try {
      await pub.call({ to, data, account: accounts[walletIdx].address });
    } catch (inner: any) {
      throw new Error(`${label || to}: ${(inner.shortMessage || inner.message).split('\n')[0]}`);
    }
    throw e;
  }
}

/** brute-force an ERC20 balance storage slot and set `holder`'s balance */
export async function deal(token: Address, holder: Address, amount: bigint): Promise<void> {
  const slots = [9, 0, 1, 2, 3, 4, 5, 51, 52, ...Array.from({ length: 40 }, (_, i) => i)];
  for (const slot of slots) {
    const key = keccak256(encodeAbiParameters(parseAbiParameters('address, uint256'), [holder, BigInt(slot)]));
    const before = await pub.getStorageAt({ address: token, slot: key });
    await anvil('anvil_setStorageAt', [token, key, pad(toHex(amount), { size: 32 })]);
    const bal = await pub.readContract({ address: token, abi: ERC20_ABI, functionName: 'balanceOf', args: [holder] });
    if (bal === amount) return;
    await anvil('anvil_setStorageAt', [token, key, (before ?? pad('0x0', { size: 32 })) as Hex]);
  }
  throw new Error('balance slot not found for ' + token);
}

export const bal = (token: Address, who: Address) =>
  pub.readContract({ address: token, abi: ERC20_ABI, functionName: 'balanceOf', args: [who] });

export const u6 = (n: bigint) => (Number(n) / 1e6).toLocaleString(undefined, { maximumFractionDigits: 6 });

export const log = {
  h: (s: string) => console.log('\n' + s),
  ok: (s: string) => console.log('  \x1b[32m✓\x1b[0m ' + s),
  bad: (s: string) => console.log('  \x1b[31m✗\x1b[0m ' + s),
  info: (s: string) => console.log('  · ' + s),
  check: (c: boolean, s: string) => (c ? log.ok(s) : (log.bad(s), (process.exitCode = 1))),
};
