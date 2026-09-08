/**
 * Phase 3 fork-test — the keeper (run.ts + tick.ts + signer + notify).
 *
 *  1. deposit + persist a PositionRecord (rule: take-profit at +20bps)
 *  2. runKeeperOnce()                          → hold (within limits)
 *  3. warp 40d → Aave yield alone takes total return past +20bps
 *  4. rule.autoUnwind = false → runKeeperOnce  → alert, status 'alerting'
 *  5. signerFor → null       → runKeeperOnce   → alert (no-signer fallback)
 *  6. real signer            → runKeeperOnce   → unwound: docked, USDC back,
 *                                                status 'unwound', tx hashes stored
 *  7. runKeeperOnce()                          → [] (record is terminal)
 *
 *   npm run phase3:fork
 */
import { buildDeposit } from '../src/lib/aqua/deposit';
import { USDC, USDbC, aUSDC, aUSDbC, AAVE_POOL, AAVE_POOL_ABI } from '../src/lib/aqua/constants';
import { MemoryRuleStore, type PositionRecord, type Rule } from '../src/lib/rules';
import { runKeeperOnce, LocalKeySigner, consoleNotifier, type KeeperDeps } from '../src/lib/keeper';
import { pub, accounts, sendStep, deal, bal, u6, log, RPC } from './forkutil';

const legA = { token: USDC, aToken: aUSDC, decimals: 6 };
const legB = { token: USDbC, aToken: aUSDbC, decimals: 6 };
const aaveIndex = (a: `0x${string}`) =>
  pub.readContract({ address: AAVE_POOL, abi: AAVE_POOL_ABI, functionName: 'getReserveNormalizedIncome', args: [a] }) as Promise<bigint>;

async function main() {
  const user = accounts[0].address;
  log.h('=== AquaLadder Phase 3 fork-test — keeper ===');
  log.info(`RPC ${RPC}  block ${await pub.getBlockNumber()}`);

  // ---- 1. deposit + record ----
  const depositBlock = await pub.getBlockNumber();
  await deal(USDC, user, 1_000n * 10n ** 6n);
  const plan = buildDeposit({ user, usdcAmount: 1_000n * 10n ** 6n, pegBand: 'wide' });
  for (let i = 0; i < plan.shipStepIndex; i++) await sendStep(0, plan.steps[i].to, plan.steps[i].data, plan.steps[i].label);
  const realA = await bal(aUSDC, user);
  const realB = await bal(aUSDbC, user);
  const idxA = await aaveIndex(USDC);
  const idxB = await aaveIndex(USDbC);
  const { step: shipStep, shipped } = plan.balancedShipStep(realA, realB);
  await sendStep(0, shipStep.to, shipStep.data, 'ship');
  log.ok(`deposited → shipped ${u6(shipped)}/leg  (${plan.strategyHash.slice(0, 10)}…)`);

  const store = new MemoryRuleStore();
  const rule: Rule = { takeProfitBps: 20, stopLossBps: 500, autoUnwind: true };
  const record: PositionRecord = {
    user, strategyHash: plan.strategyHash, chainId: 8453, createdAt: Date.now(),
    rule, legA, legB, strategyBytes: plan.strategy.strategyBytes,
    shippedPrincipalA: shipped, shippedPrincipalB: shipped,
    aaveIndexAtShipA: idxA, aaveIndexAtShipB: idxB,
    depositBlock, status: 'active',
  };
  await store.put(record);

  const signer = new LocalKeySigner(accounts[0], RPC, pub);
  const withSigner: KeeperDeps = { client: pub, store, signerFor: () => signer, notify: consoleNotifier };
  const noSigner: KeeperDeps = { ...withSigner, signerFor: () => null };

  // ---- 2. hold ----
  log.h('[2] runKeeperOnce — fresh position');
  let res = await runKeeperOnce(withSigner);
  log.check(res.length === 1 && res[0].action === 'hold', `${res.length} tick(s), action=${res[0]?.action} (${res[0]?.detail}, pegDev ${res[0]?.pegDeviationBps})`);

  // ---- 3. warp 40d so Aave supply yield alone pushes total return past +20bps ----
  log.h('[3] warp 40 days');
  await pub.request({ method: 'evm_increaseTime' as any, params: [40 * 86_400] as any });
  await pub.request({ method: 'evm_mine' as any, params: [] as any });
  log.ok('fork clock +40 days');

  // ---- 4. alert-only (autoUnwind off) ----
  log.h('[4] runKeeperOnce — rule.autoUnwind = false');
  await store.update(user, plan.strategyHash, { rule: { ...rule, autoUnwind: false } });
  res = await runKeeperOnce(withSigner);
  log.check(res[0].action === 'alert' && res[0].detail.includes('take-profit'), `action=${res[0].action} — ${res[0].detail}  (return ${res[0].totalReturnBps?.toFixed(1)}bps)`);
  log.check((await store.get(user, plan.strategyHash))!.status === 'alerting', `store status = alerting`);

  // ---- 5. no signer attached ----
  log.h('[5] runKeeperOnce — autoUnwind true, no signer');
  await store.update(user, plan.strategyHash, { rule, status: 'active' });
  res = await runKeeperOnce(noSigner);
  log.check(res[0].action === 'alert' && res[0].detail.includes('no signer'), `action=${res[0].action} — ${res[0].detail}`);
  log.check((await store.get(user, plan.strategyHash))!.status === 'alerting', `store status = alerting`);

  // ---- 6. real unwind ----
  log.h('[6] runKeeperOnce — signer attached');
  await store.update(user, plan.strategyHash, { status: 'active' });
  const usdcBefore = await bal(USDC, user);
  res = await runKeeperOnce(withSigner);
  const rec = (await store.get(user, plan.strategyHash))!;
  log.check(res[0].action === 'unwound', `action=${res[0].action} — ${res[0].detail}`);
  log.check(res[0].txHashes!.length === 3, `${res[0].txHashes!.length} txs (dock + 2 withdraws)`);
  log.check(rec.status === 'unwound' && !!rec.unwoundAt && rec.unwindTxHashes?.length === 3, `record: status ${rec.status}, ${rec.unwindTxHashes?.length} tx hashes stored`);
  const usdcAfter = await bal(USDC, user);
  log.check(usdcAfter > usdcBefore, `USDC back to wallet: ${u6(usdcBefore)} → ${u6(usdcAfter)}  (+${u6(usdcAfter - usdcBefore)})`);

  // ---- 7. terminal ----
  log.h('[7] runKeeperOnce — record is terminal');
  res = await runKeeperOnce(withSigner);
  log.check(res.length === 0, `${res.length} ticks (unwound records are skipped)`);

  log.h(process.exitCode ? '=== FAIL ===\n' : '=== Phase 3 keeper: PASS ===\n');
}

main().catch((e) => { console.error('\nFATAL:', e); process.exit(1); });
