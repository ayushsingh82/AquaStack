/**
 * AquaStack Phase 0 de-risk spike — items 3, 4, 5
 *
 *  3. Rebase test (the critical one): ship a pegged aUSDC/aUSDbC strategy, warp the
 *     fork clock, and confirm the Aave yield accrues IN THE MAKER WALLET while Aqua's
 *     virtual balance stays fixed (not swept into the pool). quote/swap/dock still work.
 *  4. aToken -> Aqua approval + pull: a real swap pulls a rebasing aToken from the
 *     maker mid-swap.
 *  5. dock() behaviour for the keeper: instant, pure-accounting, and every "already
 *     docked / never shipped / swap-after-dock" path reverts.
 *
 *   anvil --fork-url https://base.drpc.org --fork-block-number <latest-30> --silent &
 *   npx tsx phase0b.ts
 */
import { encodeFunctionData, decodeFunctionResult, keccak256, getAddress } from 'viem';
import { Address } from '@1inch/sdk-core';
import { AquaPeggedAmmStrategy, Order, MakerTraits, TakerTraits, SwapVMContract, instructions } from '@1inch/swap-vm-sdk';
import {
  RPC, CHAIN_ID, AQUA, ROUTER, AQUA_ABI, VM_ABI, USDC, USDbC, aUSDC, aUSDbC,
  AAVE_POOL, AAVE_POOL_ABI, ERC20_ABI, pub, maker, taker, makerW, takerW,
  c, deal, warp, u6, MAX_UINT,
} from './common';

const DAY = 86_400;

async function bal(token: `0x${string}`, who: `0x${string}`) {
  return pub.readContract({ address: token, abi: ERC20_ABI, functionName: 'balanceOf', args: [who] });
}
async function virt(hash: `0x${string}`, token: `0x${string}`) {
  const [b] = (await pub.readContract({
    address: AQUA, abi: AQUA_ABI, functionName: 'rawBalances', args: [maker.address, ROUTER, hash, token],
  })) as [bigint, number];
  return b;
}
async function send(w: typeof makerW, to: `0x${string}`, data: `0x${string}`, label = '') {
  const r = await pub.waitForTransactionReceipt({ hash: await w.sendTransaction({ to, data, chain: null }) });
  if (r.status !== 'success') throw new Error(`tx reverted${label ? ` (${label})` : ''}: ${to}`);
  return r;
}
async function supplyToAave(w: typeof makerW, who: `0x${string}`, asset: `0x${string}`, amount: bigint) {
  await send(w, asset, encodeFunctionData({ abi: ERC20_ABI, functionName: 'approve', args: [AAVE_POOL, MAX_UINT] }));
  await send(w, AAVE_POOL, encodeFunctionData({ abi: AAVE_POOL_ABI, functionName: 'supply', args: [asset, amount, who, 0] }));
}

async function main() {
  c.h('=== AquaStack Phase 0 spike — items 3, 4, 5 (Base fork) ===');
  const cid = await pub.getChainId();
  c.info(`RPC ${RPC}  chainId ${cid}  block ${await pub.getBlockNumber()}`);
  if (cid !== CHAIN_ID) throw new Error('not a Base fork');

  // --- get real rebasing aTokens for maker + taker via Aave supply ---
  const principalA = 100_000n * 10n ** 6n; // maker aUSDC leg
  const principalB = 100_000n * 10n ** 6n; // maker aUSDbC leg
  const takerSupply = 2_000n * 10n ** 6n;  // taker swaps aUSDC -> aUSDbC (pulls aUSDbC from maker)

  await deal(USDC, maker.address, principalA);
  await deal(USDbC, maker.address, principalB);
  await deal(USDC, taker.address, takerSupply);
  await supplyToAave(makerW, maker.address, USDC, principalA);
  await supplyToAave(makerW, maker.address, USDbC, principalB);
  await supplyToAave(takerW, taker.address, USDC, takerSupply);

  const shipA = await bal(aUSDC, maker.address);
  const shipB = await bal(aUSDbC, maker.address);
  const takerAIn = await bal(aUSDC, taker.address);
  c.ok(`maker supplied to Aave -> ${u6(shipA)} aUSDC + ${u6(shipB)} aUSDbC ; taker ${u6(takerAIn)} aUSDC`);

  // ---------------------------------------------------------------
  c.h('[4] aToken -> Aqua approve + ship + pull');
  for (const t of [aUSDC, aUSDbC]) {
    await send(makerW, t, encodeFunctionData({ abi: ERC20_ABI, functionName: 'approve', args: [AQUA, MAX_UINT] }));
  }
  const allowA = await pub.readContract({ address: aUSDC, abi: ERC20_ABI, functionName: 'allowance', args: [maker.address, AQUA] });
  c.check(allowA === MAX_UINT, `aUSDC.approve(Aqua) set, allowance = max`);

  const linearWidth = instructions.peggedSwap.linearWidthFromSymmetricRangePercent(0.5);
  const runSalt = BigInt(Date.now()); // keep each run's strategy hashes unique
  const strat = AquaPeggedAmmStrategy.new({
    tokenA: { address: new Address(aUSDC), decimals: 6, reserve: shipA },
    tokenB: { address: new Address(aUSDbC), decimals: 6, reserve: shipB },
    linearWidth,
  }).withSalt(runSalt);
  const order = Order.new({ maker: new Address(maker.address), traits: MakerTraits.default(), program: strat.build() });
  const rb = order.build();
  const built = { maker: getAddress(rb.maker.toString()), traits: BigInt(rb.traits), data: rb.data.toString() as `0x${string}` };
  const strategyBytes = order.encode().toString() as `0x${string}`;
  const hash = keccak256(strategyBytes);
  const onchainHash = await pub.readContract({ address: ROUTER, abi: VM_ABI, functionName: 'hash', args: [built] });
  c.check(onchainHash.toLowerCase() === hash.toLowerCase(), `strategyHash matches router.hash(order)`);

  const shipRcpt = await send(makerW, AQUA, encodeFunctionData({ abi: AQUA_ABI, functionName: 'ship', args: [ROUTER, strategyBytes, [aUSDC, aUSDbC], [shipA, shipB]] }));
  c.check(shipRcpt.status === 'success', `aqua.ship(aUSDC/aUSDbC) status=${shipRcpt.status} gas=${shipRcpt.gasUsed}`);
  c.check((await virt(hash, aUSDC)) === shipA && (await virt(hash, aUSDbC)) === shipB, `virtual balances recorded: ${u6(await virt(hash, aUSDC))} / ${u6(await virt(hash, aUSDbC))}`);

  // a real swap: taker gives aUSDC, Aqua pulls aUSDbC from maker's wallet mid-swap
  const makerAUSDbC_before = await bal(aUSDbC, maker.address);
  await send(takerW, aUSDC, encodeFunctionData({ abi: ERC20_ABI, functionName: 'approve', args: [ROUTER, MAX_UINT] }));
  const tt = TakerTraits.default();
  const swapAmt = 1_000n * 10n ** 6n;
  const swapData = SwapVMContract.encodeSwapCallData({ order, tokenIn: new Address(aUSDC), tokenOut: new Address(aUSDbC), amount: swapAmt, takerTraits: tt }).toString() as `0x${string}`;
  try {
    const sr = await send(takerW, ROUTER, swapData, 'aToken swap');
    const takerGot = await bal(aUSDbC, taker.address);
    const makerAUSDbC_after = await bal(aUSDbC, maker.address);
    c.check(takerGot > 0n, `swap settled: taker received ${u6(takerGot)} aUSDbC  gas=${sr.gasUsed}`);
    c.check(makerAUSDbC_after < makerAUSDbC_before, `Aqua pulled aUSDbC from maker wallet mid-swap: ${u6(makerAUSDbC_before)} -> ${u6(makerAUSDbC_after)}`);
    c.ok('item 4: rebasing aToken approve + Aqua pull works');
  } catch (e: any) {
    c.bad(`swap with aTokens reverted: ${e.shortMessage || e.message}`);
    c.info('FINDING: aToken (scaled-balance) transfer may not satisfy SwapVM strict accounting — investigate before Phase 1');
  }

  // ---------------------------------------------------------------
  c.h('[3] Rebase test — does the yield stay in the maker wallet?');
  // fresh strategy with no swaps against it, so the wallet delta is pure yield
  const strat2 = AquaPeggedAmmStrategy.new({
    tokenA: { address: new Address(aUSDC), decimals: 6, reserve: 50_000n * 10n ** 6n },
    tokenB: { address: new Address(aUSDbC), decimals: 6, reserve: 50_000n * 10n ** 6n },
    linearWidth,
  }).withSalt(runSalt + 1n);
  const order2 = Order.new({ maker: new Address(maker.address), traits: MakerTraits.default(), program: strat2.build() });
  const bytes2 = order2.encode().toString() as `0x${string}`;
  const hash2 = keccak256(bytes2);
  const shipAmt = 50_000n * 10n ** 6n;

  const walletBeforeShip = await bal(aUSDC, maker.address);
  await send(makerW, AQUA, encodeFunctionData({ abi: AQUA_ABI, functionName: 'ship', args: [ROUTER, bytes2, [aUSDC, aUSDbC], [shipAmt, shipAmt]] }));
  const virtAtShip = await virt(hash2, aUSDC);
  const idxAtShip = await pub.readContract({ address: AAVE_POOL, abi: AAVE_POOL_ABI, functionName: 'getReserveNormalizedIncome', args: [USDC] });
  c.info(`shipped ${u6(shipAmt)} aUSDC into strategy #2 ; virtual balance ${u6(virtAtShip)} ; maker aUSDC wallet ${u6(await bal(aUSDC, maker.address))}`);

  await warp(90 * DAY);
  c.info('warped fork clock +90 days');

  const walletAfter = await bal(aUSDC, maker.address);
  const virtAfter = await virt(hash2, aUSDC);
  const idxAfter = await pub.readContract({ address: AAVE_POOL, abi: AAVE_POOL_ABI, functionName: 'getReserveNormalizedIncome', args: [USDC] });

  c.check(idxAfter > idxAtShip, `Aave normalized income rose: ${idxAtShip} -> ${idxAfter}`);
  c.check(walletAfter > walletBeforeShip, `maker aUSDC WALLET balance grew over 90d: ${u6(walletBeforeShip)} -> ${u6(walletAfter)}  (+${u6(walletAfter - walletBeforeShip)})`);
  c.check(virtAfter === virtAtShip, `Aqua VIRTUAL balance unchanged by the rebase: ${u6(virtAfter)} (yield was NOT swept into the pool)`);

  // quote still works after the rebase
  const qd = SwapVMContract.encodeQuoteCallData({ order: order2, tokenIn: new Address(aUSDbC), tokenOut: new Address(aUSDC), amount: 500n * 10n ** 6n, takerTraits: tt }).toString() as `0x${string}`;
  const qr = await pub.call({ to: ROUTER, data: qd, account: taker.address });
  const [qIn, qOut] = decodeFunctionResult({ abi: VM_ABI, functionName: 'quote', data: qr.data! }) as [bigint, bigint, string];
  c.check(Number(qOut) / Number(qIn) > 0.98, `quote still works post-rebase: ${u6(qIn)} -> ${u6(qOut)} (rate ${(Number(qOut) / Number(qIn)).toFixed(5)})`);

  // dock: maker keeps every aToken, including the accrued yield
  const walletBeforeDock = await bal(aUSDC, maker.address);
  const dr = await send(makerW, AQUA, encodeFunctionData({ abi: AQUA_ABI, functionName: 'dock', args: [ROUTER, hash2, [aUSDC, aUSDbC]] }));
  const walletAfterDock = await bal(aUSDC, maker.address);
  c.check(dr.status === 'success', `aqua.dock() status=${dr.status} gas=${dr.gasUsed} (instant, pure accounting)`);
  c.check(walletAfterDock >= walletBeforeDock, `dock moved no tokens; maker keeps ${u6(walletAfterDock)} aUSDC (principal + 90d yield, fully liquid)`);
  c.ok('item 3: Aave yield accrues in the wallet; Aqua never sees it — "one balance, two jobs" holds');

  // ---------------------------------------------------------------
  c.h('[5] dock() idempotency & guards (keeper safety)');
  const [, dockedCount] = (await pub.readContract({ address: AQUA, abi: AQUA_ABI, functionName: 'rawBalances', args: [maker.address, ROUTER, hash2, aUSDC] })) as [bigint, number];
  c.check(dockedCount === 255, `rawBalances shows _DOCKED marker (tokensCount = ${dockedCount})`);

  try {
    await pub.readContract({ address: AQUA, abi: AQUA_ABI, functionName: 'safeBalances', args: [maker.address, ROUTER, hash2, aUSDC, aUSDbC] });
    c.bad('safeBalances did NOT revert for a docked strategy');
  } catch {
    c.ok('safeBalances reverts for a docked strategy (SafeBalancesForTokenNotInActiveStrategy)');
  }

  const dockAgain = encodeFunctionData({ abi: AQUA_ABI, functionName: 'dock', args: [ROUTER, hash2, [aUSDC, aUSDbC]] });
  try {
    await pub.call({ to: AQUA, data: dockAgain, account: maker.address });
    c.bad('second dock() did NOT revert');
  } catch (e: any) {
    c.ok(`second dock() reverts: ${(e.shortMessage || e.message).split('\n')[0]}`);
  }

  const neverShipped = keccak256('0xdeadbeef');
  try {
    await pub.call({ to: AQUA, data: encodeFunctionData({ abi: AQUA_ABI, functionName: 'dock', args: [ROUTER, neverShipped, [aUSDC, aUSDbC]] }), account: maker.address });
    c.bad('dock() of a never-shipped strategy did NOT revert');
  } catch {
    c.ok('dock() of a never-shipped strategy reverts');
  }

  try {
    const sd = SwapVMContract.encodeSwapCallData({ order: order2, tokenIn: new Address(aUSDbC), tokenOut: new Address(aUSDC), amount: 100n * 10n ** 6n, takerTraits: tt }).toString() as `0x${string}`;
    await pub.call({ to: ROUTER, data: sd, account: taker.address });
    c.bad('swap against a docked strategy did NOT revert');
  } catch {
    c.ok('swap against a docked strategy reverts');
  }
  c.ok('item 5: keeper can safely retry dock() — every stale path reverts, not silently succeeds');

  c.h('=== items 3, 4, 5: done ===\n');
}

main().catch((e) => { console.error('\nFATAL:', e); process.exit(1); });
