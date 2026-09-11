/**
 * AquaStack Phase 0 de-risk spike — items 1 & 2
 *
 *  1. Are Aqua + AquaSwapVMRouter callable on a Base fork? (bytecode + read methods)
 *  2. Does the pegged strategy run on today's pre-Fusaka deployment?
 *     ship() a pegged USDC/USDbC strategy -> swapVM.quote() -> swapVM.swap() -> aqua.dock()
 *
 *   anvil --fork-url https://base.drpc.org --fork-block-number <latest-30> --silent &
 *   npx tsx phase0.ts
 */
import { encodeFunctionData, decodeFunctionResult, keccak256, getAddress } from 'viem';
import { Address } from '@1inch/sdk-core';
import * as aquaSdk from '@1inch/aqua-sdk';
import { AquaPeggedAmmStrategy, Order, MakerTraits, TakerTraits, SwapVMContract, instructions } from '@1inch/swap-vm-sdk';
import {
  RPC, CHAIN_ID, AQUA, ROUTER, AQUA_ABI, VM_ABI, USDC, USDbC, ERC20_ABI,
  pub, maker, taker, makerW, takerW, c, deal, u6, MAX_UINT,
} from './common';

async function main() {
  c.h('=== AquaStack Phase 0 spike — items 1 & 2 (Base fork) ===');
  const [bn, cid] = [await pub.getBlockNumber(), await pub.getChainId()];
  c.info(`RPC ${RPC}  chainId ${cid}  block ${bn}`);
  if (cid !== CHAIN_ID) throw new Error('not a Base fork');

  // ---------------------------------------------------------------
  c.h('[1] Aqua + AquaSwapVMRouter callable on the fork');
  const aquaCode = await pub.getCode({ address: AQUA });
  const routerCode = await pub.getCode({ address: ROUTER });
  c.check(!!aquaCode && aquaCode.length > 2, `Aqua ${AQUA} bytecode ${((aquaCode || '').length - 2) / 2} bytes`);
  c.check(!!routerCode && routerCode.length > 2, `AquaSwapVMRouter ${ROUTER} bytecode ${((routerCode || '').length - 2) / 2} bytes`);

  const zeroHash = `0x${'00'.repeat(32)}` as const;
  const raw = await pub.readContract({ address: AQUA, abi: AQUA_ABI, functionName: 'rawBalances', args: [maker.address, ROUTER, zeroHash, USDC] });
  c.ok(`aqua.rawBalances read OK -> [${[...(raw as bigint[])].map(String).join(', ')}]`);
  const typehash = await pub.readContract({ address: ROUTER, abi: VM_ABI, functionName: 'ORDER_TYPEHASH', args: [] });
  c.ok(`router.ORDER_TYPEHASH read OK -> ${typehash}`);

  const ids = Object.keys(aquaSdk.AQUA_CONTRACT_ADDRESSES);
  const testnets = ids.filter((id) => [11155111, 84532, 421614, 11155420, 80002].includes(Number(id)));
  c.info(`SDK address map chains: ${ids.join(',')}`);
  c.check(testnets.length === 0, 'no known testnet chainIds in SDK map -> a mainnet fork is the only path');

  // ---------------------------------------------------------------
  c.h('[2] Pegged strategy on the live deployment (USDC/USDbC)');
  const makerA = 100_000n * 10n ** 6n;
  const makerB = 100_000n * 10n ** 6n;
  const takerIn = 1_000n * 10n ** 6n;
  const sA = await deal(USDC, maker.address, makerA);
  const sB = await deal(USDbC, maker.address, makerB);
  await deal(USDbC, taker.address, takerIn);
  c.info(`dealt: maker ${u6(makerA)} USDC (slot ${sA}) + ${u6(makerB)} USDbC (slot ${sB}); taker ${u6(takerIn)} USDbC`);

  for (const t of [USDC, USDbC]) {
    const h = await makerW.writeContract({ address: t, abi: ERC20_ABI, functionName: 'approve', args: [AQUA, MAX_UINT], chain: null });
    await pub.waitForTransactionReceipt({ hash: h });
  }
  c.ok('maker approved Aqua for USDC + USDbC');

  const linearWidth = instructions.peggedSwap.linearWidthFromSymmetricRangePercent(0.5); // ±0.5% band
  const strat = AquaPeggedAmmStrategy.new({
    tokenA: { address: new Address(USDC), decimals: 6, reserve: makerA },
    tokenB: { address: new Address(USDbC), decimals: 6, reserve: makerB },
    linearWidth,
  }).withSalt(BigInt(Date.now())); // unique strategy hash per run
  const program = strat.build();
  const order = Order.new({ maker: new Address(maker.address), traits: MakerTraits.default(), program });
  const rb = order.build();
  const built = { maker: getAddress(rb.maker.toString()), traits: BigInt(rb.traits), data: rb.data.toString() as `0x${string}` };
  const strategyBytes = order.encode().toString() as `0x${string}`;
  const strategyHash = keccak256(strategyBytes);
  c.info(`linearWidth=${linearWidth}  program ${(program.toString().length - 2) / 2} bytes`);

  const onchainHash = await pub.readContract({ address: ROUTER, abi: VM_ABI, functionName: 'hash', args: [built] });
  c.check(onchainHash.toLowerCase() === strategyHash.toLowerCase(), `SDK strategyHash == router.hash(order)  ${strategyHash}`);

  const shipData = encodeFunctionData({ abi: AQUA_ABI, functionName: 'ship', args: [ROUTER, strategyBytes, [USDC, USDbC], [makerA, makerB]] });
  const shipRcpt = await pub.waitForTransactionReceipt({ hash: await makerW.sendTransaction({ to: AQUA, data: shipData, chain: null }) });
  c.check(shipRcpt.status === 'success', `aqua.ship() status=${shipRcpt.status} gas=${shipRcpt.gasUsed}`);

  const [balA] = await pub.readContract({ address: AQUA, abi: AQUA_ABI, functionName: 'rawBalances', args: [maker.address, ROUTER, strategyHash, USDC] }) as [bigint, number];
  const [balB] = await pub.readContract({ address: AQUA, abi: AQUA_ABI, functionName: 'rawBalances', args: [maker.address, ROUTER, strategyHash, USDbC] }) as [bigint, number];
  c.check(balA === makerA && balB === makerB, `aqua virtual balances after ship: ${u6(balA)} / ${u6(balB)}`);
  const walletA = await pub.readContract({ address: USDC, abi: ERC20_ABI, functionName: 'balanceOf', args: [maker.address] });
  c.check(walletA === makerA, `maker still holds real USDC after ship: ${u6(walletA)} (ship moved no tokens)`);

  const tt = TakerTraits.default();
  const quoteData = SwapVMContract.encodeQuoteCallData({ order, tokenIn: new Address(USDbC), tokenOut: new Address(USDC), amount: takerIn, takerTraits: tt }).toString() as `0x${string}`;
  const res = await pub.call({ to: ROUTER, data: quoteData, account: taker.address });
  const [qIn, qOut] = decodeFunctionResult({ abi: VM_ABI, functionName: 'quote', data: res.data! }) as [bigint, bigint, string];
  c.ok(`swapVM.quote() executed the pegged program on live bytecode`);
  const rate = Number(qOut) / Number(qIn);
  c.info(`quote: ${u6(qIn)} USDbC in -> ${u6(qOut)} USDC out  (rate ${rate.toFixed(5)})`);
  c.check(rate > 0.98 && rate < 1.02, 'pegged rate within ±2% of 1.0 -> opcode math sane');

  const th = await takerW.writeContract({ address: USDbC, abi: ERC20_ABI, functionName: 'approve', args: [ROUTER, MAX_UINT], chain: null });
  await pub.waitForTransactionReceipt({ hash: th });
  const swapData = SwapVMContract.encodeSwapCallData({ order, tokenIn: new Address(USDbC), tokenOut: new Address(USDC), amount: takerIn, takerTraits: tt }).toString() as `0x${string}`;
  const sr = await pub.waitForTransactionReceipt({ hash: await takerW.sendTransaction({ to: ROUTER, data: swapData, chain: null }) });
  const takerUSDC = await pub.readContract({ address: USDC, abi: ERC20_ABI, functionName: 'balanceOf', args: [taker.address] });
  c.check(sr.status === 'success' && takerUSDC > 0n, `swapVM.swap() settled: taker holds ${u6(takerUSDC)} USDC  gas=${sr.gasUsed}`);

  const dockData = encodeFunctionData({ abi: AQUA_ABI, functionName: 'dock', args: [ROUTER, strategyHash, [USDC, USDbC]] });
  const dr = await pub.waitForTransactionReceipt({ hash: await makerW.sendTransaction({ to: AQUA, data: dockData, chain: null }) });
  c.check(dr.status === 'success', `aqua.dock() status=${dr.status} gas=${dr.gasUsed}`);

  c.h('=== items 1 & 2: PASS ===\n');
}

main().catch((e) => { console.error('\nFATAL:', e); process.exit(1); });
