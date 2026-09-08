/**
 * Phase 1 fork-test — modules 1 & 2 (strategy.ts, deposit.ts)
 *
 * Proves buildDeposit() produces a plan that, executed step-by-step against a
 * live Base fork, ends with the pegged aUSDC/aUSDbC strategy shipped into Aqua
 * with the maker's real aToken balances.
 *
 *   anvil --fork-url https://mainnet.base.org --fork-block-number <latest-40> --silent &
 *   npx tsx scripts/phase1.fork.ts
 */
import { decodeFunctionResult } from 'viem';
import { buildDeposit } from '../src/lib/aqua/deposit';
import { PEG_BAND_PRESETS } from '../src/lib/aqua/strategy';
import {
  USDC, aUSDC, aUSDbC, AQUA, AQUA_SWAP_VM_ROUTER, AQUA_ABI, SWAP_VM_ABI,
} from '../src/lib/aqua/constants';
import { pub, accounts, sendStep, deal, bal, u6, log, RPC } from './forkutil';

async function virt(hash: `0x${string}`, token: `0x${string}`) {
  const [b] = (await pub.readContract({
    address: AQUA, abi: AQUA_ABI, functionName: 'rawBalances',
    args: [accounts[0].address, AQUA_SWAP_VM_ROUTER, hash, token],
  })) as [bigint, number];
  return b;
}

async function main() {
  const user = accounts[0].address;
  log.h('=== AquaLadder Phase 1 fork-test — deposit.ts + strategy.ts ===');
  log.info(`RPC ${RPC}  chainId ${await pub.getChainId()}  block ${await pub.getBlockNumber()}`);

  // NB: USDbC DEX liquidity on Base is thin (~15k in the Aerodrome stable pool),
  // so the demo deposit is small. See the Phase 1 finding in workdone.md.
  const deposit = 1_000n * 10n ** 6n; // 1k USDC
  await deal(USDC, user, deposit);
  log.ok(`dealt ${u6(deposit)} USDC to ${user}`);

  // ---- module 1 + 2: build the plan ----
  const plan = buildDeposit({ user, usdcAmount: deposit, pegBand: 'balanced', makerFeeBps: 1 });
  log.h('[plan] buildDeposit()');
  log.info(`strategyHash ${plan.strategyHash}`);
  log.info(`pegBand ±${plan.strategy.pegBand}% (preset "balanced" = ${PEG_BAND_PRESETS.balanced})  salt ${plan.strategy.salt}`);
  plan.steps.forEach((s, i) => log.info(`${i}. ${s.label}`));

  // strategy hash must match the on-chain router
  const onchain = await pub.readContract({ address: AQUA_SWAP_VM_ROUTER, abi: SWAP_VM_ABI, functionName: 'hash', args: [plan.strategy.orderTuple] });
  log.check(onchain.toLowerCase() === plan.strategyHash.toLowerCase(), 'strategyHash == router.hash(order)');

  // ---- execute steps 0..shipStepIndex-1 (swap + supplies + approvals) ----
  log.h('[exec] running plan steps against the fork');
  for (let i = 0; i < plan.shipStepIndex; i++) {
    const g = await sendStep(0, plan.steps[i].to, plan.steps[i].data, plan.steps[i].label);
    log.ok(`${plan.steps[i].label}  (gas ${g})`);
  }

  const realAUsdc = await bal(aUSDC, user);
  const realAUsdbc = await bal(aUSDbC, user);
  const tol = 10n; // aToken balanceOf floors by up to ~1 wei per op
  log.info(`post-supply aToken balances: ${u6(realAUsdc)} aUSDC / ${u6(realAUsdbc)} aUSDbC`);
  log.check(realAUsdc + tol >= plan.planned.shipAUsdc, `real aUSDC ≳ planned (${u6(realAUsdc)} vs ${u6(plan.planned.shipAUsdc)})`);
  log.check(realAUsdbc + tol >= plan.planned.shipAUsdbc, `real aUSDbC ≳ planned (${u6(realAUsdbc)} vs ${u6(plan.planned.shipAUsdbc)})`);

  // ---- ship a balanced pool with the real balances ----
  const { step: shipStep, shipped, remainder } = plan.balancedShipStep(realAUsdc, realAUsdbc);
  const walletAUsdcBeforeShip = await bal(aUSDC, user);
  const shipGas = await sendStep(0, shipStep.to, shipStep.data, shipStep.label);
  log.ok(`${shipStep.label}  balanced ${u6(shipped)}/leg, ${u6(remainder.amount)} ${remainder.token} left in wallet  (gas ${shipGas})`);

  // ---- assertions ----
  log.h('[verify]');
  log.check((await virt(plan.strategyHash, aUSDC)) === shipped, `Aqua virtual balance aUSDC == shipped ${u6(shipped)}`);
  log.check((await virt(plan.strategyHash, aUSDbC)) === shipped, `Aqua virtual balance aUSDbC == shipped ${u6(shipped)}`);
  log.check((await bal(aUSDC, user)) >= walletAUsdcBeforeShip, 'ship moved no tokens — maker still holds the aUSDC in-wallet (rebase only grows it)');

  // a quote confirms the shipped strategy is live and priced sanely
  const { SwapVMContract, TakerTraits } = await import('@1inch/swap-vm-sdk');
  const { Address } = await import('@1inch/sdk-core');
  const qd = SwapVMContract.encodeQuoteCallData({
    order: plan.strategy.order, tokenIn: new Address(aUSDbC), tokenOut: new Address(aUSDC),
    amount: 100n * 10n ** 6n, takerTraits: TakerTraits.default(),
  }).toString() as `0x${string}`;
  const qr = await pub.call({ to: AQUA_SWAP_VM_ROUTER, data: qd, account: accounts[1].address });
  const [qIn, qOut] = decodeFunctionResult({ abi: SWAP_VM_ABI, functionName: 'quote', data: qr.data! }) as [bigint, bigint, string];
  log.check(Number(qOut) / Number(qIn) > 0.98, `quote on shipped strategy: ${u6(qIn)} aUSDbC → ${u6(qOut)} aUSDC (rate ${(Number(qOut) / Number(qIn)).toFixed(5)})`);

  log.h(process.exitCode ? '=== FAIL ===\n' : '=== Phase 1 modules 1 & 2: PASS ===\n');
}

main().catch((e) => { console.error('\nFATAL:', e); process.exit(1); });
