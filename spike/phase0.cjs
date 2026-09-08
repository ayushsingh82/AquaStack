/**
 * AquaLadder Phase 0 de-risk spike — items 1 & 2
 *
 *  1. Are Aqua + AquaSwapVMRouter callable on a Base fork? (bytecode + read methods)
 *  2. Does the pegged strategy run on today's pre-Fusaka deployment?
 *     ship() a pegged USDC/USDT strategy -> swapVM.quote() -> swapVM.swap() -> aqua.dock()
 *
 * Run against an anvil Base fork:
 *   anvil --fork-url https://base-rpc.publicnode.com --silent &
 *   node spike/phase0.cjs
 */
const {
  createPublicClient, createWalletClient, http, parseAbi, encodeFunctionData,
  decodeFunctionResult, keccak256, getAddress, pad, toHex, encodeAbiParameters,
  parseAbiParameters, hexToBigInt,
} = require('viem');
const { privateKeyToAccount } = require('viem/accounts');

const aquaSdk = require('@1inch/aqua-sdk');
const vmSdk = require('@1inch/swap-vm-sdk');
const core = require('@1inch/sdk-core');

const RPC = process.env.RPC || 'http://127.0.0.1:8545';
const CHAIN_ID = 8453; // Base

// ---- canonical deployments (from the SDK address maps) ----
const AQUA = getAddress(aquaSdk.AQUA_CONTRACT_ADDRESSES[CHAIN_ID].toString());
const ROUTER = getAddress(vmSdk.AQUA_SWAP_VM_CONTRACT_ADDRESSES[CHAIN_ID].toString());

// ---- Base tokens ----
const USDC = getAddress('0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'); // 6 dec
const USDT = getAddress('0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2'); // 6 dec

// anvil default accounts
const MAKER_PK = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
const TAKER_PK = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';

const ERC20_ABI = parseAbi([
  'function balanceOf(address) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function approve(address,uint256) returns (bool)',
  'function allowance(address,address) view returns (uint256)',
]);
const AQUA_ABI = aquaSdk.ABI.AQUA_ABI;
const VM_ABI = vmSdk.ABI.SWAP_VM_ABI;

const pub = createPublicClient({ transport: http(RPC) });
const maker = privateKeyToAccount(MAKER_PK);
const taker = privateKeyToAccount(TAKER_PK);
const makerW = createWalletClient({ account: maker, transport: http(RPC) });
const takerW = createWalletClient({ account: taker, transport: http(RPC) });

const line = (s = '') => console.log(s);
const ok = (s) => console.log('  \x1b[32m✓\x1b[0m ' + s);
const bad = (s) => console.log('  \x1b[31m✗\x1b[0m ' + s);
const info = (s) => console.log('  · ' + s);

async function anvil(method, params) {
  return pub.request({ method, params });
}

/** brute-force ERC20 balance storage slot and set `holder` balance to `amount` */
async function deal(token, holder, amount) {
  for (let slot = 0; slot < 40; slot++) {
    const key = keccak256(encodeAbiParameters(parseAbiParameters('address, uint256'), [holder, BigInt(slot)]));
    const before = await pub.getStorageAt({ address: token, slot: key });
    await anvil('anvil_setStorageAt', [token, key, pad(toHex(amount), { size: 32 })]);
    const bal = await pub.readContract({ address: token, abi: ERC20_ABI, functionName: 'balanceOf', args: [holder] });
    if (bal === amount) return slot;
    // restore and keep looking
    await anvil('anvil_setStorageAt', [token, key, before ?? pad('0x0', { size: 32 })]);
  }
  throw new Error('could not locate balance slot for ' + token);
}

async function main() {
  line('\n=== AquaLadder Phase 0 spike — Base fork ===');
  const bn = await pub.getBlockNumber();
  const cid = await pub.getChainId();
  info(`RPC ${RPC}  chainId ${cid}  block ${bn}`);
  if (cid !== CHAIN_ID) throw new Error('not a Base fork');

  // ---------------------------------------------------------------
  line('\n[1] Aqua + AquaSwapVMRouter callable on the fork');
  const aquaCode = await pub.getCode({ address: AQUA });
  const routerCode = await pub.getCode({ address: ROUTER });
  (aquaCode && aquaCode.length > 2 ? ok : bad)(`Aqua ${AQUA} bytecode ${((aquaCode || '').length - 2) / 2} bytes`);
  (routerCode && routerCode.length > 2 ? ok : bad)(`AquaSwapVMRouter ${ROUTER} bytecode ${((routerCode || '').length - 2) / 2} bytes`);

  // read methods
  const zeroHash = '0x' + '00'.repeat(32);
  const raw = await pub.readContract({ address: AQUA, abi: AQUA_ABI, functionName: 'rawBalances', args: [maker.address, ROUTER, zeroHash, USDC] });
  ok(`aqua.rawBalances read OK -> [${[].concat(raw).map(String).join(', ')}]`);
  const typehash = await pub.readContract({ address: ROUTER, abi: VM_ABI, functionName: 'ORDER_TYPEHASH', args: [] });
  ok(`router.ORDER_TYPEHASH read OK -> ${typehash}`);

  const testnetIds = Object.keys(aquaSdk.AQUA_CONTRACT_ADDRESSES).filter(id => [11155111, 84532, 421614, 11155420].includes(Number(id)));
  info(`SDK address map chains: ${Object.keys(aquaSdk.AQUA_CONTRACT_ADDRESSES).join(',')}`);
  (testnetIds.length === 0 ? ok : bad)(`no known testnet chainIds in SDK map -> fork is the only path`);

  // ---------------------------------------------------------------
  line('\n[2] Pegged strategy on the live deployment');

  // fund maker (liquidity) + taker (swap input)
  const makerA = 100_000n * 10n ** 6n;   // 100k USDC
  const makerB = 100_000n * 10n ** 6n;   // 100k USDT
  const takerIn = 1_000n * 10n ** 6n;    // taker swaps 1k USDT -> USDC
  const sA = await deal(USDC, maker.address, makerA);
  const sB = await deal(USDT, maker.address, makerB);
  await deal(USDT, taker.address, takerIn);
  info(`dealt: maker ${makerA / 10n ** 6n} USDC (slot ${sA}) + ${makerB / 10n ** 6n} USDT (slot ${sB}); taker ${takerIn / 10n ** 6n} USDT`);

  // maker approves Aqua so pull() can move tokens during a swap
  for (const t of [USDC, USDT]) {
    const h = await makerW.writeContract({ address: t, abi: ERC20_ABI, functionName: 'approve', args: [AQUA, 2n ** 256n - 1n], chain: null });
    await pub.waitForTransactionReceipt({ hash: h });
  }
  ok('maker approved Aqua for USDC + USDT');

  // build the pegged strategy program via the SDK
  const { AquaPeggedAmmStrategy, Order, MakerTraits, TakerTraits, SwapVMContract } = vmSdk;
  const linearWidth = vmSdk.instructions.peggedSwap.linearWidthFromSymmetricRangePercent(0.5); // ±0.5% band
  const strat = AquaPeggedAmmStrategy.new({
    tokenA: { address: new core.Address(USDC), decimals: 6, reserve: makerA },
    tokenB: { address: new core.Address(USDT), decimals: 6, reserve: makerB },
    linearWidth,
  });
  const program = strat.build();
  info(`linearWidth=${linearWidth}  program=${program.toString().slice(0, 42)}… (${(program.toString().length - 2) / 2} bytes)`);

  const order = Order.new({ maker: new core.Address(maker.address), traits: MakerTraits.default(), program });
  const rawBuilt = order.build();        // { maker, traits, data }
  const built = {
    maker: getAddress(rawBuilt.maker.toString()),
    traits: BigInt(rawBuilt.traits),
    data: rawBuilt.data.toString(),
  };
  const strategyBytes = order.encode().toString();  // abi.encode(order tuple)
  const strategyHash = keccak256(strategyBytes);

  // cross-check against on-chain router.hash(order)
  const onchainHash = await pub.readContract({ address: ROUTER, abi: VM_ABI, functionName: 'hash', args: [built] });
  (onchainHash.toLowerCase() === strategyHash.toLowerCase() ? ok : bad)(`strategyHash ${strategyHash} == router.hash(order) ${onchainHash}`);

  // ship() via Aqua  (pure accounting — no token transfer)
  const shipData = encodeFunctionData({ abi: AQUA_ABI, functionName: 'ship', args: [ROUTER, strategyBytes, [USDC, USDT], [makerA, makerB]] });
  const shipHash = await makerW.sendTransaction({ to: AQUA, data: shipData, chain: null });
  const shipRcpt = await pub.waitForTransactionReceipt({ hash: shipHash });
  (shipRcpt.status === 'success' ? ok : bad)(`aqua.ship() status=${shipRcpt.status} gas=${shipRcpt.gasUsed}`);

  const [balUSDC] = await pub.readContract({ address: AQUA, abi: AQUA_ABI, functionName: 'rawBalances', args: [maker.address, ROUTER, strategyHash, USDC] });
  const [balUSDT] = await pub.readContract({ address: AQUA, abi: AQUA_ABI, functionName: 'rawBalances', args: [maker.address, ROUTER, strategyHash, USDT] });
  (balUSDC === makerA && balUSDT === makerB ? ok : bad)(`aqua virtual balances after ship: USDC=${balUSDC} USDT=${balUSDT}`);
  const walletUSDC = await pub.readContract({ address: USDC, abi: ERC20_ABI, functionName: 'balanceOf', args: [maker.address] });
  (walletUSDC === makerA ? ok : bad)(`maker still holds real USDC in wallet after ship: ${walletUSDC} (ship did NOT move tokens)`);

  // quote()  — runs the pegged VM program against the live router bytecode
  const takerTraits = TakerTraits.default();
  const quoteData = SwapVMContract.encodeQuoteCallData({
    order, tokenIn: new core.Address(USDT), tokenOut: new core.Address(USDC), amount: takerIn, takerTraits,
  }).toString();
  try {
    const res = await pub.call({ to: ROUTER, data: quoteData, account: taker.address });
    const [qIn, qOut, qHash] = decodeFunctionResult({ abi: VM_ABI, functionName: 'quote', data: res.data });
    ok(`swapVM.quote() executed the pegged program on live bytecode`);
    info(`quote: ${Number(qIn) / 1e6} USDT in -> ${Number(qOut) / 1e6} USDC out  (rate ${(Number(qOut) / Number(qIn)).toFixed(5)})  orderHash ${qHash.slice(0, 10)}…`);
    const rate = Number(qOut) / Number(qIn);
    (rate > 0.98 && rate < 1.02 ? ok : bad)(`pegged rate within ±2% of 1.0 -> opcode math sane`);
  } catch (e) {
    bad(`swapVM.quote() reverted: ${e.shortMessage || e.message}`);
    throw e;
  }

  // swap()  — actual settlement from an EOA taker
  line('');
  try {
    const th = await takerW.writeContract({ address: USDT, abi: ERC20_ABI, functionName: 'approve', args: [ROUTER, 2n ** 256n - 1n], chain: null });
    await pub.waitForTransactionReceipt({ hash: th });
    const swapData = SwapVMContract.encodeSwapCallData({
      order, tokenIn: new core.Address(USDT), tokenOut: new core.Address(USDC), amount: takerIn, takerTraits,
    }).toString();
    const sh = await takerW.sendTransaction({ to: ROUTER, data: swapData, chain: null });
    const sr = await pub.waitForTransactionReceipt({ hash: sh });
    if (sr.status === 'success') {
      const takerUSDC = await pub.readContract({ address: USDC, abi: ERC20_ABI, functionName: 'balanceOf', args: [taker.address] });
      ok(`swapVM.swap() settled: taker now holds ${Number(takerUSDC) / 1e6} USDC  gas=${sr.gasUsed}`);
      const mUSDC = await pub.readContract({ address: USDC, abi: ERC20_ABI, functionName: 'balanceOf', args: [maker.address] });
      const mUSDT = await pub.readContract({ address: USDT, abi: ERC20_ABI, functionName: 'balanceOf', args: [maker.address] });
      info(`maker wallet after swap: ${Number(mUSDC) / 1e6} USDC / ${Number(mUSDT) / 1e6} USDT (Aqua pulled/pushed against the wallet)`);
    } else {
      bad(`swapVM.swap() tx reverted (status ${sr.status}) — quote path still proves the opcode runs`);
    }
  } catch (e) {
    bad(`swapVM.swap() from EOA taker failed: ${e.shortMessage || e.message}`);
    info('(not fatal for item 2 — quote() already proved the pegged opcode executes)');
  }

  // dock() + idempotency (item 5 preview)
  line('');
  const dockData = encodeFunctionData({ abi: AQUA_ABI, functionName: 'dock', args: [ROUTER, strategyHash, [USDC, USDT]] });
  const dh = await makerW.sendTransaction({ to: AQUA, data: dockData, chain: null });
  const dr = await pub.waitForTransactionReceipt({ hash: dh });
  (dr.status === 'success' ? ok : bad)(`aqua.dock() status=${dr.status} gas=${dr.gasUsed} (instant, pure accounting)`);
  try {
    await pub.call({ to: AQUA, data: dockData, account: maker.address });
    bad('second dock() did NOT revert — idempotency guard weaker than expected');
  } catch (e) {
    ok(`second dock() reverts as expected: ${(e.shortMessage || e.message).split('\n')[0]}`);
  }

  line('\n=== spike complete ===\n');
}

main().catch((e) => { console.error('\nFATAL:', e); process.exit(1); });
