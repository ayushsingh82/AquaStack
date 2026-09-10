/**
 * End-to-end on REAL Base Sepolia (chain 84532) — no anvil, no fork.
 *
 *   deposit (USDC + USDT -> Aave -> ship)  ->  readPosition
 *     ->  2 taker swaps against the pegged pool  ->  readPosition
 *     ->  buildUnwind (dock + Aave withdraw)  ->  funds back  ->  docked
 *
 * Test tokens come from the Aave v3 Base Sepolia faucet (unpermissioned
 * `mint(token,to,amount)`). No time-warp — Aave yield over the test window is
 * ~0; the yield maths is already proven on the fork e2e (scripts/e2e.sepolia.ts).
 *
 *   PK=0x<deployer> npx tsx scripts/e2e.testnet.ts
 *   (defaults PK to .deploy-key.json)
 */
import './_env';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  createPublicClient, createWalletClient, http, encodeFunctionData, parseEther,
  type Address, type Hex,
} from 'viem';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
import { readPosition } from '../src/lib/aqua/position';
import { buildUnwind } from '../src/lib/aqua/unwind';
import { buildDeposit } from '../src/lib/aqua/deposit';
import { evaluate, RULE_PRESETS } from '../src/lib/rules';
import {
  USDC, USDbC, aUSDC, aUSDbC, AAVE_POOL, AQUA_SWAP_VM_ROUTER,
  ERC20_ABI, AAVE_POOL_ABI, MAX_UINT256,
} from '../src/lib/aqua/constants';
import { Address as SdkAddress } from '@1inch/sdk-core';
import { SwapVMContract, TakerTraits } from '@1inch/swap-vm-sdk';

const RPC = process.env.RPC_URL || 'https://sepolia.base.org';
const FAUCET = '0xD9145b5F45Ad4519c7ACcD6E0A4A82e83bB8A6Dc' as Address; // Aave v3 Base Sepolia faucet
const FAUCET_ABI = [{
  type: 'function', name: 'mint', stateMutability: 'nonpayable',
  inputs: [{ name: 'token', type: 'address' }, { name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }],
  outputs: [{ name: '', type: 'uint256' }],
}] as const;

const DEPOSIT_PER_LEG = 1_500n * 10n ** 6n;
const SWAP = 5n * 10n ** 6n;

const pub = createPublicClient({ transport: http(RPC, { timeout: 60_000, retryCount: 5 }) });

const pk = (process.env.PK ||
  (JSON.parse(readFileSync(path.resolve(__dirname, '../.deploy-key.json'), 'utf8')) as { privateKey: Hex }).privateKey) as Hex;
const maker = privateKeyToAccount(pk);
const takerPk = (process.env.TAKER_PK || generatePrivateKey()) as Hex;
const taker = privateKeyToAccount(takerPk);

const wMaker = createWalletClient({ account: maker, transport: http(RPC) });
const wTaker = createWalletClient({ account: taker, transport: http(RPC) });

const u6 = (n: bigint) => (Number(n) / 1e6).toLocaleString(undefined, { maximumFractionDigits: 6 });
const log = {
  h: (s: string) => console.log('\n' + s),
  ok: (s: string) => console.log('  \x1b[32m✓\x1b[0m ' + s),
  bad: (s: string) => console.log('  \x1b[31m✗\x1b[0m ' + s),
  info: (s: string) => console.log('  · ' + s),
  check: (c: boolean, s: string) => (c ? log.ok(s) : (log.bad(s), (process.exitCode = 1))),
};
const bal = (t: Address, who: Address) =>
  pub.readContract({ address: t, abi: ERC20_ABI, functionName: 'balanceOf', args: [who] }) as Promise<bigint>;

async function send(w: typeof wMaker, to: Address, data: Hex, label = ''): Promise<bigint> {
  const acct = w === wMaker ? maker.address : taker.address;
  try {
    const hash = await w.sendTransaction({ to, data, chain: null, gas: 3_000_000n });
    const r = await pub.waitForTransactionReceipt({ hash });
    if (r.status !== 'success') {
      try {
        await pub.call({ to, data, account: acct, blockNumber: r.blockNumber });
      } catch (inner: unknown) {
        const m = inner as { shortMessage?: string; message?: string };
        throw new Error(`${label || to}: ${(m.shortMessage || m.message || String(inner)).split('\n')[0]}`);
      }
      throw new Error(`tx reverted${label ? ` (${label})` : ''} — no reason (${hash})`);
    }
    if (label) log.info(`${label} — gas ${r.gasUsed}  ${hash}`);
    return r.gasUsed;
  } catch (e: unknown) {
    try {
      await pub.call({ to, data, account: acct });
    } catch (inner: unknown) {
      const m = inner as { shortMessage?: string; message?: string };
      throw new Error(`${label || to}: ${(m.shortMessage || m.message || String(inner)).split('\n')[0]}`);
    }
    throw e;
  }
}

const faucet = (w: typeof wMaker, token: Address, to: Address, amount: bigint, label: string) =>
  send(w, FAUCET, encodeFunctionData({ abi: FAUCET_ABI, functionName: 'mint', args: [token, to, amount] }), label);

/** public Base Sepolia RPC is load-balanced and serves stale state right after a
 *  write — wait until `read()` returns `want` (or `n` polls elapse). */
async function settle<T>(read: () => Promise<T>, want: (v: T) => boolean, n = 15): Promise<T> {
  let v = await read();
  for (let i = 0; i < n && !want(v); i++) {
    await new Promise((r) => setTimeout(r, 2000));
    v = await read();
  }
  return v;
}

async function main() {
  log.h(`=== e2e on REAL Base Sepolia — chain ${await pub.getChainId()} @ block ${await pub.getBlockNumber()} ===`);
  log.info(`Aqua   ${process.env.NEXT_PUBLIC_AQUA}`);
  log.info(`Router ${process.env.NEXT_PUBLIC_AQUA_SWAP_VM_ROUTER}`);
  log.info(`maker  ${maker.address}`);
  log.info(`taker  ${taker.address}  (key ${takerPk})`);

  const makerEth = await pub.getBalance({ address: maker.address });
  log.check(makerEth > parseEther('0.01'), `maker ETH ${Number(makerEth) / 1e18}`);

  // ---- gas for the taker ----
  log.h('[0] fund taker with gas');
  const takerEth = await pub.getBalance({ address: taker.address });
  if (takerEth < parseEther('0.005')) {
    const h = await wMaker.sendTransaction({ to: taker.address, value: parseEther('0.01'), chain: null });
    await pub.waitForTransactionReceipt({ hash: h });
    log.info(`sent 0.01 ETH -> taker  ${h}`);
  }

  // ---- 1. faucet + deposit ----
  log.h('[1] faucet USDC + USDT to maker, then deposit');
  const uBefore = await bal(USDC, maker.address);
  if (uBefore < DEPOSIT_PER_LEG) await faucet(wMaker, USDC, maker.address, DEPOSIT_PER_LEG, 'faucet USDC');
  if ((await bal(USDbC, maker.address)) < DEPOSIT_PER_LEG) await faucet(wMaker, USDbC, maker.address, DEPOSIT_PER_LEG, 'faucet USDT');
  log.info(`maker USDC ${u6(await bal(USDC, maker.address))} · USDT ${u6(await bal(USDbC, maker.address))}`);

  const depositBlock = await pub.getBlockNumber();
  const plan = buildDeposit({ user: maker.address, usdcAmount: DEPOSIT_PER_LEG, usdbcAmount: DEPOSIT_PER_LEG, pegBand: 'wide' });
  log.info(`strategy ${plan.strategyHash}`);
  for (let i = 0; i < plan.shipStepIndex; i++) {
    await send(wMaker, plan.steps[i].to, plan.steps[i].data, plan.steps[i].label);
  }
  const realA = await bal(aUSDC, maker.address);
  const realB = await bal(aUSDbC, maker.address);
  const { step: shipStep, shipped } = plan.balancedShipStep(realA, realB);
  await send(wMaker, shipStep.to, shipStep.data, 'ship');
  log.ok(`shipped ${u6(shipped)} / leg`);

  const rule = { ...RULE_PRESETS.balanced };
  const readInput = {
    maker: maker.address, strategyHash: plan.strategyHash, order: plan.strategy.order,
    legA: plan.legs.usdc, legB: plan.legs.usdbc,
    shippedPrincipalA: shipped, shippedPrincipalB: shipped,
    aaveIndexAtShipA: 0n, aaveIndexAtShipB: 0n,
    eventsFromBlock: depositBlock,
  };

  // ---- 2. read fresh ----
  log.h('[2] readPosition() — fresh');
  let pos = await settle(() => readPosition(pub, readInput), (p) => p.status === 'active');
  log.check(pos.status === 'active', `status ${pos.status}`);
  log.check(pos.swaps.count === 0, `swaps ${pos.swaps.count}`);
  log.info(`peg deviation ${pos.pegDeviationBps}bps`);

  // ---- 3. taker swaps ----
  log.h('[3] taker: faucet USDT -> Aave -> 2 swaps aUSDT->aUSDC');
  await faucet(wTaker, USDbC, taker.address, 200n * 10n ** 6n, 'faucet USDT (taker)');
  await send(wTaker, USDbC, encodeFunctionData({ abi: ERC20_ABI, functionName: 'approve', args: [AAVE_POOL, MAX_UINT256] }), 'approve USDT->Aave');
  await send(wTaker, AAVE_POOL, encodeFunctionData({ abi: AAVE_POOL_ABI, functionName: 'supply', args: [USDbC, 200n * 10n ** 6n, taker.address, 0] }), 'supply USDT');
  await send(wTaker, aUSDbC, encodeFunctionData({ abi: ERC20_ABI, functionName: 'approve', args: [AQUA_SWAP_VM_ROUTER, MAX_UINT256] }), 'approve aUSDT->router');
  for (let i = 0; i < 2; i++) {
    const data = SwapVMContract.encodeSwapCallData({
      order: plan.strategy.order,
      tokenIn: new SdkAddress(aUSDbC), tokenOut: new SdkAddress(aUSDC),
      amount: SWAP, takerTraits: TakerTraits.default(),
    }).toString() as Hex;
    await send(wTaker, AQUA_SWAP_VM_ROUTER, data, `taker swap ${u6(SWAP)}`);
  }

  // ---- 4. read after ----
  log.h('[4] readPosition() — after swaps');
  pos = await settle(() => readPosition(pub, readInput), (p) => p.swaps.count === 2);
  log.check(pos.swaps.count === 2, `swaps ${pos.swaps.count}`);
  log.info(`Aave yield ${u6(pos.aaveYieldTotal)} · Aqua PnL ${pos.aquaPnl >= 0n ? '+' : ''}${u6(pos.aquaPnl)} · peg ${pos.pegDeviationBps}bps`);
  const verdict = evaluate(pos, rule);
  log.info(`rule verdict: ${verdict.action} (return ${verdict.metrics.totalReturnBps.toFixed(1)}bps)`);

  // ---- 5. unwind ----
  log.h('[5] buildUnwind() + execute');
  const unwind = await buildUnwind(pub, {
    user: maker.address, strategyHash: plan.strategyHash,
    legA: plan.legs.usdc, legB: plan.legs.usdbc, withdrawFromAave: true,
  });
  log.check(!unwind.alreadyDocked && unwind.steps.length >= 1, `plan: ${unwind.steps.length} steps, status ${unwind.status}`);
  const usdcBefore = await bal(USDC, maker.address);
  const usdtBefore = await bal(USDbC, maker.address);
  for (const s of unwind.steps) await send(wMaker, s.to, s.data, s.label);
  const usdcAfter = await settle(() => bal(USDC, maker.address), (b) => b > usdcBefore);
  const usdtAfter = await settle(() => bal(USDbC, maker.address), (b) => b > usdtBefore);
  log.check(usdcAfter > usdcBefore, `USDC back: ${u6(usdcBefore)} -> ${u6(usdcAfter)} (+${u6(usdcAfter - usdcBefore)})`);
  log.check(usdcAfter + usdtAfter >= 2n * DEPOSIT_PER_LEG - 10n ** 6n, `maker whole: USDC ${u6(usdcAfter)} + USDT ${u6(usdtAfter)} = ${u6(usdcAfter + usdtAfter)}`);

  // ---- 6. docked ----
  log.h('[6] readPosition() — docked');
  pos = await settle(() => readPosition(pub, readInput), (p) => p.status === 'docked');
  log.check(pos.status === 'docked', `status ${pos.status}`);

  log.h(process.exitCode ? '=== e2e FAILED ===\n' : '=== e2e PASSED ===\n');
}

main().catch((e) => { console.error('\nFATAL:', e); process.exit(1); });
