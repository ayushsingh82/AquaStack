/**
 * Taker-swap against an existing live position (real Base Sepolia), using the
 * deployer wallet as counterparty. Reads the position straight out of the app's
 * own JSON store so it targets exactly what the UI shows.
 *
 *   npx tsx scripts/swap-against.ts <user> <strategyHash> [count] [amountUsd]
 *
 * e.g. npx tsx scripts/swap-against.ts 0xB822...dec1 0x6122f2...b639a 3 5
 */
import './_env';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createPublicClient, createWalletClient, http, encodeFunctionData, type Address, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { Order } from '@1inch/swap-vm-sdk';
import { HexString, Address as SdkAddress } from '@1inch/sdk-core';
import { SwapVMContract, TakerTraits } from '@1inch/swap-vm-sdk';
import { JsonFileRuleStore } from '../src/lib/rules';
import {
  USDC, USDbC, aUSDC, aUSDbC, AAVE_POOL, AQUA_SWAP_VM_ROUTER,
  ERC20_ABI, AAVE_POOL_ABI, MAX_UINT256,
} from '../src/lib/aqua/constants';

const RPC = process.env.RPC_URL || 'https://sepolia.base.org';
const FAUCET = '0xD9145b5F45Ad4519c7ACcD6E0A4A82e83bB8A6Dc' as Address;
const FAUCET_ABI = [{
  type: 'function', name: 'mint', stateMutability: 'nonpayable',
  inputs: [{ name: 'token', type: 'address' }, { name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }],
  outputs: [{ name: '', type: 'uint256' }],
}] as const;

const [userArg, hashArg, countArg, amountArg] = process.argv.slice(2);
if (!userArg || !hashArg) {
  console.error('usage: swap-against.ts <user> <strategyHash> [count=2] [amountUsd=5]');
  process.exit(1);
}
const user = userArg as Address;
const strategyHash = hashArg as Hex;
const count = countArg ? Number(countArg) : 2;
const amount = BigInt(Math.round(Number(amountArg ?? '5') * 1e6));

const pub = createPublicClient({ transport: http(RPC, { timeout: 60_000, retryCount: 5 }) });
const pk = (process.env.PK ||
  (JSON.parse(readFileSync(path.resolve(__dirname, '../.deploy-key.json'), 'utf8')) as { privateKey: Hex }).privateKey) as Hex;
const taker = privateKeyToAccount(pk);
const w = createWalletClient({ account: taker, transport: http(RPC) });

const u6 = (n: bigint) => (Number(n) / 1e6).toLocaleString(undefined, { maximumFractionDigits: 6 });

async function send(to: Address, data: Hex, label = ''): Promise<void> {
  const hash = await w.sendTransaction({ to, data, chain: null, gas: 3_000_000n });
  const r = await pub.waitForTransactionReceipt({ hash });
  if (r.status !== 'success') {
    try {
      await pub.call({ to, data, account: taker.address, blockNumber: r.blockNumber });
    } catch (inner: unknown) {
      const m = inner as { shortMessage?: string; message?: string };
      throw new Error(`${label || to}: ${(m.shortMessage || m.message || String(inner)).split('\n')[0]}`);
    }
    throw new Error(`tx reverted${label ? ` (${label})` : ''} (${hash})`);
  }
  console.log(`  ${label.padEnd(28)} gas ${r.gasUsed}  ${hash}`);
}

const bal = (t: Address, who: Address) =>
  pub.readContract({ address: t, abi: ERC20_ABI, functionName: 'balanceOf', args: [who] }) as Promise<bigint>;

async function main() {
  const store = new JsonFileRuleStore(process.env.RULE_STORE_PATH || '.data/positions.json');
  const record = await store.get(user, strategyHash);
  if (!record) throw new Error(`no record for ${user} / ${strategyHash}`);
  console.log(`\n=== swapping against ${strategyHash} (maker ${user}) ===`);
  console.log(`taker ${taker.address}\n`);

  const order = Order.decode(new HexString(record.strategyBytes));

  // taker needs aUSDT to swap in — make sure it's funded + supplied + approved
  const takerEth = await pub.getBalance({ address: taker.address });
  console.log(`taker ETH ${Number(takerEth) / 1e18}`);

  const need = amount * BigInt(count);
  const haveA = await bal(aUSDbC, taker.address);
  if (haveA < need) {
    const short = need - haveA;
    const haveUnderlying = await bal(USDbC, taker.address);
    if (haveUnderlying < short) {
      await send(FAUCET, encodeFunctionData({ abi: FAUCET_ABI, functionName: 'mint', args: [USDbC, taker.address, short] }), 'faucet USDT');
    }
    await send(USDbC, encodeFunctionData({ abi: ERC20_ABI, functionName: 'approve', args: [AAVE_POOL, MAX_UINT256] }), 'approve USDT->Aave');
    await send(AAVE_POOL, encodeFunctionData({ abi: AAVE_POOL_ABI, functionName: 'supply', args: [USDbC, short, taker.address, 0] }), 'supply USDT');
  }
  const allowance = await pub.readContract({ address: aUSDbC, abi: ERC20_ABI, functionName: 'allowance', args: [taker.address, AQUA_SWAP_VM_ROUTER] });
  if ((allowance as bigint) < need) {
    await send(aUSDbC, encodeFunctionData({ abi: ERC20_ABI, functionName: 'approve', args: [AQUA_SWAP_VM_ROUTER, MAX_UINT256] }), 'approve aUSDT->router');
  }

  for (let i = 0; i < count; i++) {
    const data = SwapVMContract.encodeSwapCallData({
      order, tokenIn: new SdkAddress(aUSDbC), tokenOut: new SdkAddress(aUSDC),
      amount, takerTraits: TakerTraits.default(),
    }).toString() as Hex;
    await send(AQUA_SWAP_VM_ROUTER, data, `swap #${i + 1}: ${u6(amount)} aUSDT->aUSDC`);
  }

  console.log(`\ndone — ${count} swap(s) of ${u6(amount)} each against ${strategyHash.slice(0, 10)}…\n`);
}

main().catch((e) => { console.error('\nFATAL:', e); process.exit(1); });
