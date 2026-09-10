/**
 * Phase A spike — prove the FULL Aqua round-trip against contracts we deployed
 * ourselves (anvil fork of Base Sepolia, chain 84532):
 *
 *   AquaPeggedAmmStrategy (SDK) -> order.encode()
 *     -> aqua.ship()            (register virtual balances, no token move)
 *     -> swapVM.quote()         (pegged price ~1.0)
 *     -> taker swap()           (Aqua pulls one leg, pushes the other)
 *     -> aqua.dock()            (free the balance)
 *
 * All SDK mainnet addresses are overridden with our deployed ones.
 *
 *   RPC=http://localhost:8545 npx tsx scripts/spike-sepolia.ts \
 *     <AQUA> <ROUTER> <TOKEN_A> <TOKEN_B>
 */
import {
  createPublicClient, createWalletClient, http, parseAbi, encodeFunctionData,
  decodeFunctionResult, keccak256, type Address, type Hex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { Address as SdkAddress } from '@1inch/sdk-core';
import {
  AquaPeggedAmmStrategy, Order, MakerTraits, instructions,
  SwapVMContract, TakerTraits, ABI as VM_ABI,
} from '@1inch/swap-vm-sdk';
import * as aquaSdk from '@1inch/aqua-sdk';

const RPC = process.env.RPC || 'http://localhost:8545';
const PK = (process.env.PK ||
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80') as Hex;
const TAKER_PK =
  '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d' as Hex;

const [AQUA, ROUTER, TOKEN_A, TOKEN_B] = process.argv.slice(2) as Address[];
if (!AQUA || !ROUTER || !TOKEN_A || !TOKEN_B) {
  console.error('usage: spike-sepolia.ts <AQUA> <ROUTER> <TOKEN_A> <TOKEN_B>');
  process.exit(1);
}

const AQUA_ABI = aquaSdk.ABI.AQUA_ABI;
const SWAP_VM_ABI = VM_ABI.SWAP_VM_ABI;
const ERC20 = parseAbi([
  'function mint(address,uint256)',
  'function approve(address,uint256) returns (bool)',
  'function balanceOf(address) view returns (uint256)',
]);

const pub = createPublicClient({ transport: http(RPC) });
const maker = privateKeyToAccount(PK);
const taker = privateKeyToAccount(TAKER_PK);
const makerW = createWalletClient({ account: maker, transport: http(RPC) });
const takerW = createWalletClient({ account: taker, transport: http(RPC) });

const u6 = (n: bigint) => (Number(n) / 1e6).toFixed(4);
const ok = (c: boolean, m: string) => {
  console.log(`  ${c ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${m}`);
  if (!c) process.exitCode = 1;
};

async function send(w: typeof makerW, to: Address, data: Hex, label: string) {
  const hash = await w.sendTransaction({ to, data, chain: null });
  const r = await pub.waitForTransactionReceipt({ hash });
  if (r.status !== 'success') throw new Error(`revert: ${label}`);
  return r;
}

async function main() {
  console.log(`\n=== Phase A spike — chain ${await pub.getChainId()} @ block ${await pub.getBlockNumber()} ===`);
  console.log(`  Aqua   ${AQUA}\n  Router ${ROUTER}\n  A ${TOKEN_A}\n  B ${TOKEN_B}`);

  const SHIP = 50_000n * 10n ** 6n; // 50k each leg
  const bandPct = 1.0;

  // ---- 1. mint + approvals ----
  console.log('\n[1] mint tokens, approve Aqua');
  await send(makerW, TOKEN_A, encodeFunctionData({ abi: ERC20, functionName: 'mint', args: [maker.address, SHIP] }), 'mint A');
  await send(makerW, TOKEN_B, encodeFunctionData({ abi: ERC20, functionName: 'mint', args: [maker.address, SHIP] }), 'mint B');
  await send(makerW, TOKEN_A, encodeFunctionData({ abi: ERC20, functionName: 'approve', args: [AQUA, 2n ** 256n - 1n] }), 'approve A');
  await send(makerW, TOKEN_B, encodeFunctionData({ abi: ERC20, functionName: 'approve', args: [AQUA, 2n ** 256n - 1n] }), 'approve B');

  // ---- 2. build pegged strategy via the SDK ----
  console.log('[2] build AquaPeggedAmmStrategy + order.encode()');
  const linearWidth = instructions.peggedSwap.linearWidthFromSymmetricRangePercent(bandPct);
  const salt = BigInt('0x' + Buffer.from(crypto.getRandomValues(new Uint8Array(8))).toString('hex'));
  let strat = AquaPeggedAmmStrategy.new({
    tokenA: { address: new SdkAddress(TOKEN_A), decimals: 6, reserve: SHIP },
    tokenB: { address: new SdkAddress(TOKEN_B), decimals: 6, reserve: SHIP },
    linearWidth,
  }).withSalt(salt);
  const program = strat.build();
  const order = Order.new({ maker: new SdkAddress(maker.address), traits: MakerTraits.default(), program });
  const strategyBytes = order.encode().toString() as Hex;
  ok(strategyBytes.length > 2, `order.encode() -> ${strategyBytes.length} bytes`);

  // ---- 3. ship ----
  console.log('[3] aqua.ship()');
  const balABeforeShip = (await pub.readContract({ address: TOKEN_A, abi: ERC20, functionName: 'balanceOf', args: [maker.address] })) as bigint;
  const shipData = encodeFunctionData({
    abi: AQUA_ABI, functionName: 'ship',
    args: [ROUTER, strategyBytes, [TOKEN_A, TOKEN_B], [SHIP, SHIP]],
  });
  const shipR = await send(makerW, AQUA, shipData, 'ship');
  const shippedLog = shipR.logs.find((l) => l.address.toLowerCase() === AQUA.toLowerCase());
  ok(!!shippedLog, `ship mined (gas ${shipR.gasUsed})`);
  const balAAfterShip = (await pub.readContract({ address: TOKEN_A, abi: ERC20, functionName: 'balanceOf', args: [maker.address] })) as bigint;
  ok(balAAfterShip === balABeforeShip, `Aqua's "no token move" property: maker's wallet A unchanged by ship (${u6(balAAfterShip)})`);

  // strategyHash = keccak256(order.encode()) — matches the app's strategy.ts
  const strategyHash = keccak256(strategyBytes);

  // ---- 4. quote ----
  console.log('[4] swapVM.quote()  (expect ~1.0)');
  const probe = 1_000_000n;
  const qData = SwapVMContract.encodeQuoteCallData({
    order, tokenIn: new SdkAddress(TOKEN_A), tokenOut: new SdkAddress(TOKEN_B),
    amount: probe, takerTraits: TakerTraits.default(),
  }).toString() as Hex;
  const qRes = await pub.call({ to: ROUTER, data: qData });
  const [amtIn, amtOut] = decodeFunctionResult({ abi: SWAP_VM_ABI, functionName: 'quote', data: qRes.data! }) as [bigint, bigint, Hex];
  const rate = Number(amtOut) / Number(amtIn);
  ok(rate > 0.98 && rate < 1.02, `quote rate ${rate.toFixed(6)} (in ${amtIn} out ${amtOut})`);

  // ---- 5. taker swap ----
  console.log('[5] taker swap A -> B');
  const swapAmt = 3_000_000n;
  await send(takerW, TOKEN_A, encodeFunctionData({ abi: ERC20, functionName: 'mint', args: [taker.address, swapAmt] }), 'mint taker A');
  await send(takerW, TOKEN_A, encodeFunctionData({ abi: ERC20, functionName: 'approve', args: [ROUTER, 2n ** 256n - 1n] }), 'approve taker A');
  const takerBBefore = (await pub.readContract({ address: TOKEN_B, abi: ERC20, functionName: 'balanceOf', args: [taker.address] })) as bigint;
  const swapData = SwapVMContract.encodeSwapCallData({
    order, tokenIn: new SdkAddress(TOKEN_A), tokenOut: new SdkAddress(TOKEN_B),
    amount: swapAmt, takerTraits: TakerTraits.default(),
  }).toString() as Hex;
  const swapR = await send(takerW, ROUTER, swapData, 'swap');
  const takerBAfter = (await pub.readContract({ address: TOKEN_B, abi: ERC20, functionName: 'balanceOf', args: [taker.address] })) as bigint;
  ok(takerBAfter > takerBBefore, `taker got ${u6(takerBAfter - takerBBefore)} B for ${u6(swapAmt)} A (gas ${swapR.gasUsed})`);

  // ---- 6. dock ----
  console.log('[6] aqua.dock()');
  const dockData = encodeFunctionData({
    abi: AQUA_ABI, functionName: 'dock',
    args: [ROUTER, strategyHash, [TOKEN_A, TOKEN_B]],
  });
  try {
    const dockR = await send(makerW, AQUA, dockData, 'dock');
    ok(true, `dock mined (gas ${dockR.gasUsed})`);
  } catch (e) {
    ok(false, `dock reverted: ${(e as Error).message}`);
  }
  const makerAEnd = (await pub.readContract({ address: TOKEN_A, abi: ERC20, functionName: 'balanceOf', args: [maker.address] })) as bigint;
  const makerBEnd = (await pub.readContract({ address: TOKEN_B, abi: ERC20, functionName: 'balanceOf', args: [maker.address] })) as bigint;
  ok(makerAEnd + makerBEnd > 0n, `maker liquid after dock: ${u6(makerAEnd)} A + ${u6(makerBEnd)} B`);

  console.log(process.exitCode ? '\n=== SPIKE FAILED ===\n' : '\n=== SPIKE PASSED — Base Sepolia deploy is viable ===\n');
}

main().catch((e) => { console.error('\nFATAL:', e); process.exit(1); });
