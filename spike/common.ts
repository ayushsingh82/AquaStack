/** Shared helpers for the AquaStack Phase 0 spikes. */
import {
  createPublicClient, createWalletClient, http, parseAbi, keccak256,
  encodeAbiParameters, parseAbiParameters, pad, toHex, getAddress,
  type Address as ViemAddress, type Hex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import * as aquaSdk from '@1inch/aqua-sdk';
import * as vmSdk from '@1inch/swap-vm-sdk';

export const RPC = process.env.RPC || 'http://127.0.0.1:8545';
export const CHAIN_ID = 8453; // Base

export const AQUA = getAddress(aquaSdk.AQUA_CONTRACT_ADDRESSES[CHAIN_ID].toString());
export const ROUTER = getAddress(vmSdk.AQUA_SWAP_VM_CONTRACT_ADDRESSES[CHAIN_ID].toString());
export const AQUA_ABI = aquaSdk.ABI.AQUA_ABI;
export const VM_ABI = vmSdk.ABI.SWAP_VM_ABI;

// Base tokens
export const USDC = getAddress('0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913');   // 6 dec
export const USDbC = getAddress('0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA');  // 6 dec

// Aave v3 (Base)
export const AAVE_POOL = getAddress('0xA238Dd80C259a72e81d7e4664a9801593F98d1c5');
export const aUSDC = getAddress('0x4e65fE4DbA92790696d040ac24Aa414708F5c0AB');
export const aUSDbC = getAddress('0x0a1d576f3eFeF75b330424287a95A366e8281D54');

// anvil default keys
export const MAKER_PK = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as const;
export const TAKER_PK = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d' as const;

export const ERC20_ABI = parseAbi([
  'function balanceOf(address) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function approve(address,uint256) returns (bool)',
  'function allowance(address,address) view returns (uint256)',
  'function transfer(address,uint256) returns (bool)',
]);

export const AAVE_POOL_ABI = parseAbi([
  'function supply(address asset,uint256 amount,address onBehalfOf,uint16 referralCode)',
  'function withdraw(address asset,uint256 amount,address to) returns (uint256)',
  'function getReserveNormalizedIncome(address asset) view returns (uint256)',
]);

export const pub = createPublicClient({ transport: http(RPC, { timeout: 60_000, retryCount: 5, retryDelay: 500 }) });
export const maker = privateKeyToAccount(MAKER_PK);
export const taker = privateKeyToAccount(TAKER_PK);
export const makerW = createWalletClient({ account: maker, transport: http(RPC) });
export const takerW = createWalletClient({ account: taker, transport: http(RPC) });

export const c = {
  h: (s: string) => console.log('\n' + s),
  ok: (s: string) => console.log('  \x1b[32m✓\x1b[0m ' + s),
  bad: (s: string) => console.log('  \x1b[31m✗\x1b[0m ' + s),
  info: (s: string) => console.log('  · ' + s),
  check: (cond: boolean, s: string) => (cond ? c.ok(s) : c.bad(s)),
};

export const anvil = (method: string, params: unknown[]) =>
  pub.request({ method: method as any, params: params as any });

/** brute-force an ERC20 balance storage slot and set `holder`'s balance to `amount`.
 *  Tries the common slots first (9 = Circle USDC/USDbC), then scans. */
export async function deal(token: ViemAddress, holder: ViemAddress, amount: bigint): Promise<number> {
  const order = [9, 0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 51, 52, ...Array.from({ length: 60 }, (_, i) => i)];
  for (const slot of order) {
    const key = keccak256(encodeAbiParameters(parseAbiParameters('address, uint256'), [holder, BigInt(slot)]));
    const before = await pub.getStorageAt({ address: token, slot: key });
    await anvil('anvil_setStorageAt', [token, key, pad(toHex(amount), { size: 32 })]);
    const bal = await pub.readContract({ address: token, abi: ERC20_ABI, functionName: 'balanceOf', args: [holder] });
    if (bal === amount) return slot;
    await anvil('anvil_setStorageAt', [token, key, (before ?? pad('0x0', { size: 32 })) as Hex]);
  }
  throw new Error('could not locate balance slot for ' + token);
}

/** advance the fork clock and mine a block */
export async function warp(seconds: number): Promise<void> {
  await anvil('evm_increaseTime', [seconds]);
  await anvil('evm_mine', []);
}

export const u6 = (n: bigint) => (Number(n) / 1e6).toLocaleString(undefined, { maximumFractionDigits: 6 });
export const MAX_UINT = 2n ** 256n - 1n;
