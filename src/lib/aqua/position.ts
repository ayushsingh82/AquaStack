/**
 * Module 3 — read model for a live AquaStack position.
 *
 * Pulls together, for one shipped strategy:
 *   - Aqua virtual balances per leg           (fixed since ship)
 *   - the maker's real aToken wallet balances  (rebasing)
 *   - Aave yield, computed from the reserve normalized-income index
 *     (index-based, so it doesn't depend on wallet-balance fungibility)
 *   - a live quote off the shipped strategy → current peg deviation
 *   - Shipped / Pulled / Pushed / Docked event history → swap activity
 *
 * Phase 0 established: virtual balances never move on their own; Aave yield
 * accrues on the aToken in the wallet and is invisible to the Aqua curve.
 */
import {
  decodeFunctionResult, parseAbiItem, type AbiEvent, type Address, type Hex, type PublicClient,
} from 'viem';
import { Address as SdkAddress } from '@1inch/sdk-core';
import { SwapVMContract, TakerTraits, type Order } from '@1inch/swap-vm-sdk';
import {
  AQUA, AQUA_SWAP_VM_ROUTER, AAVE_POOL, AQUA_ABI, AAVE_POOL_ABI, SWAP_VM_ABI, ERC20_ABI,
} from './constants';
import type { TokenLeg } from './types';

export type PositionStatus = 'never-shipped' | 'active' | 'docked';

export interface LegState {
  token: Address;
  aToken: Address;
  decimals: number;
  /** virtual balance held in Aqua (aToken units) — the amount that is live liquidity */
  virtualBalance: bigint;
  /** maker's real aToken balance right now (rebasing) */
  walletBalance: bigint;
  /** amount shipped for this leg at deposit time */
  shippedPrincipal: bigint;
  /** Aave reserve normalized income (ray) at ship time and now */
  aaveIndexAtShip: bigint;
  aaveIndexNow: bigint;
  /** Aave interest earned on the shipped principal since ship (aToken units) */
  aaveYield: bigint;
}

/** one on-chain event against this strategy, oldest-first in PositionState.activity */
export interface PositionEvent {
  kind: 'ship' | 'swap-out' | 'swap-in' | 'dock';
  blockNumber: bigint;
  txHash: Hex;
  logIndex: number;
  /** token that moved (swap-out / swap-in only) */
  token?: Address;
  /** amount that moved, in that token's units (swap-out / swap-in only) */
  amount?: bigint;
}

export interface PositionState {
  strategyHash: Hex;
  status: PositionStatus;
  legA: LegState;
  legB: LegState;
  /** total Aave yield across both legs, in 6dp stable value */
  aaveYieldTotal: bigint;
  /** (current virtual value) − (shipped value); positive ≈ net swap fees, negative ≈ inventory/IL loss */
  aquaPnl: bigint;
  /** small round-trip probe off the live strategy (rate = out/in, ideally ≈ 1) */
  quote: { probeAmount: bigint; aToB: number; bToA: number };
  /** worst-direction deviation from a 1:1 peg, in bps */
  pegDeviationBps: number;
  /** cumulative token flow through swaps against this strategy (from events, excludes the ship deposit) */
  swaps: { pulled: bigint; pushed: bigint; count: number };
  /** ship / swap / dock events against this strategy, oldest-first (excludes the ship's own leg pushes) */
  activity: PositionEvent[];
}

export interface ReadPositionInput {
  maker: Address;
  strategyHash: Hex;
  /** the SDK Order for this strategy (from BuiltStrategy.order) — used for the quote probe */
  order: Order;
  legA: TokenLeg;
  legB: TokenLeg;
  shippedPrincipalA: bigint;
  shippedPrincipalB: bigint;
  aaveIndexAtShipA: bigint;
  aaveIndexAtShipB: bigint;
  /**
   * block to scan Aqua events from. Default 0n, but pass the deposit block:
   * forked/hosted RPCs cap `eth_getLogs` ranges (~10k blocks), and 0n forces a
   * scan of all history.
   */
  eventsFromBlock?: bigint;
  /** probe size for the quote, in the smaller-decimals unit. Default 1 whole token. */
  probeAmount?: bigint;
}

const PULLED_EVT = parseAbiItem('event Pulled(address maker, address app, bytes32 strategyHash, address token, uint256 amount)');
const PUSHED_EVT = parseAbiItem('event Pushed(address maker, address app, bytes32 strategyHash, address token, uint256 amount)');
const SHIPPED_EVT = parseAbiItem('event Shipped(address maker, address app, bytes32 strategyHash, bytes strategy)');
const DOCKED_EVT = parseAbiItem('event Docked(address maker, address app, bytes32 strategyHash)');

async function rawBalance(client: PublicClient, maker: Address, hash: Hex, token: Address): Promise<{ balance: bigint; tokensCount: number }> {
  const [balance, tokensCount] = (await client.readContract({
    address: AQUA, abi: AQUA_ABI, functionName: 'rawBalances', args: [maker, AQUA_SWAP_VM_ROUTER, hash, token],
  })) as [bigint, number];
  return { balance, tokensCount };
}

export function statusFromTokensCount(tokensCount: number): PositionStatus {
  if (tokensCount === 0) return 'never-shipped';
  if (tokensCount === 255) return 'docked';
  return 'active';
}

/** true iff the strategy is currently active (shipped and not docked) */
export async function isPositionActive(client: PublicClient, maker: Address, hash: Hex, aToken: Address): Promise<boolean> {
  return statusFromTokensCount((await rawBalance(client, maker, hash, aToken)).tokensCount) === 'active';
}

// Most hosted RPCs (Alchemy, Infura, QuickNode free tiers, etc.) cap eth_getLogs
// to a 10,000-block range per call. Split wide ranges into chunks and merge.
const MAX_LOG_RANGE = 9_999n;

async function getLogsChunked<TAbiEvent extends AbiEvent>(
  client: PublicClient,
  params: { address: Address; event: TAbiEvent; fromBlock: bigint; toBlock: bigint },
) {
  const { address, event, fromBlock, toBlock } = params;
  if (toBlock - fromBlock <= MAX_LOG_RANGE) {
    return client.getLogs({ address, event, fromBlock, toBlock });
  }
  const ranges: { fromBlock: bigint; toBlock: bigint }[] = [];
  for (let start = fromBlock; start <= toBlock; start += MAX_LOG_RANGE + 1n) {
    const end = start + MAX_LOG_RANGE < toBlock ? start + MAX_LOG_RANGE : toBlock;
    ranges.push({ fromBlock: start, toBlock: end });
  }
  const chunks = await Promise.all(
    ranges.map((r) => client.getLogs({ address, event, fromBlock: r.fromBlock, toBlock: r.toBlock })),
  );
  return chunks.flat();
}

async function quoteRate(client: PublicClient, order: Order, tokenIn: Address, tokenOut: Address, amount: bigint): Promise<number> {
  const data = SwapVMContract.encodeQuoteCallData({
    order, tokenIn: new SdkAddress(tokenIn), tokenOut: new SdkAddress(tokenOut), amount, takerTraits: TakerTraits.default(),
  }).toString() as Hex;
  const res = await client.call({ to: AQUA_SWAP_VM_ROUTER, data });
  const [amountIn, amountOut] = decodeFunctionResult({ abi: SWAP_VM_ABI, functionName: 'quote', data: res.data! }) as [bigint, bigint, Hex];
  return Number(amountOut) / Number(amountIn);
}

export async function readPosition(client: PublicClient, input: ReadPositionInput): Promise<PositionState> {
  const { maker, strategyHash: hash, legA, legB } = input;
  const fromBlock = input.eventsFromBlock ?? 0n;
  const probeAmount = input.probeAmount ?? 10n ** BigInt(Math.min(legA.decimals, legB.decimals));

  const [rawA, rawB, walletA, walletB, idxNowA, idxNowB, toBlock] = await Promise.all([
    rawBalance(client, maker, hash, legA.aToken),
    rawBalance(client, maker, hash, legB.aToken),
    client.readContract({ address: legA.aToken, abi: ERC20_ABI, functionName: 'balanceOf', args: [maker] }) as Promise<bigint>,
    client.readContract({ address: legB.aToken, abi: ERC20_ABI, functionName: 'balanceOf', args: [maker] }) as Promise<bigint>,
    client.readContract({ address: AAVE_POOL, abi: AAVE_POOL_ABI, functionName: 'getReserveNormalizedIncome', args: [legA.token] }) as Promise<bigint>,
    client.readContract({ address: AAVE_POOL, abi: AAVE_POOL_ABI, functionName: 'getReserveNormalizedIncome', args: [legB.token] }) as Promise<bigint>,
    client.getBlockNumber(),
  ]);

  const status = statusFromTokensCount(rawA.tokensCount);

  const yieldFor = (principal: bigint, atShip: bigint, now: bigint) =>
    atShip > 0n ? (principal * (now - atShip)) / atShip : 0n;

  const legStateA: LegState = {
    token: legA.token, aToken: legA.aToken, decimals: legA.decimals,
    virtualBalance: rawA.balance, walletBalance: walletA,
    shippedPrincipal: input.shippedPrincipalA,
    aaveIndexAtShip: input.aaveIndexAtShipA, aaveIndexNow: idxNowA,
    aaveYield: yieldFor(input.shippedPrincipalA, input.aaveIndexAtShipA, idxNowA),
  };
  const legStateB: LegState = {
    token: legB.token, aToken: legB.aToken, decimals: legB.decimals,
    virtualBalance: rawB.balance, walletBalance: walletB,
    shippedPrincipal: input.shippedPrincipalB,
    aaveIndexAtShip: input.aaveIndexAtShipB, aaveIndexNow: idxNowB,
    aaveYield: yieldFor(input.shippedPrincipalB, input.aaveIndexAtShipB, idxNowB),
  };

  const shippedValue = input.shippedPrincipalA + input.shippedPrincipalB;
  const virtualValue = rawA.balance + rawB.balance;
  const aquaPnl = status === 'active' ? virtualValue - shippedValue : 0n;

  let aToB = 1, bToA = 1;
  if (status === 'active') {
    [aToB, bToA] = await Promise.all([
      quoteRate(client, input.order, legA.aToken, legB.aToken, probeAmount),
      quoteRate(client, input.order, legB.aToken, legA.aToken, probeAmount),
    ]);
  }
  const pegDeviationBps = Math.round(Math.max(Math.abs(1 - aToB), Math.abs(1 - bToA)) * 10_000);

  const mine = (l: { args: { maker?: Address; strategyHash?: Hex } }) =>
    l.args.maker?.toLowerCase() === maker.toLowerCase() && l.args.strategyHash?.toLowerCase() === hash.toLowerCase();

  const [pulled, pushed, shipped, docked] = await Promise.all([
    getLogsChunked(client, { address: AQUA, event: PULLED_EVT, fromBlock, toBlock }),
    getLogsChunked(client, { address: AQUA, event: PUSHED_EVT, fromBlock, toBlock }),
    getLogsChunked(client, { address: AQUA, event: SHIPPED_EVT, fromBlock, toBlock }),
    getLogsChunked(client, { address: AQUA, event: DOCKED_EVT, fromBlock, toBlock }),
  ]);
  const pulledMine = pulled.filter(mine);
  const pushedMine = pushed.filter(mine);
  const shippedMine = shipped.filter(mine);
  const dockedMine = docked.filter(mine);
  // ship() emits one Pushed per leg; drop those (2 per Shipped event for this strategy)
  const shipPushes = shippedMine.length * 2;
  const swapPushes = pushedMine.slice(Math.min(shipPushes, pushedMine.length));

  const activity: PositionEvent[] = [
    ...shippedMine.map((l) => ev('ship', l)),
    ...pulledMine.map((l) => ev('swap-out', l, l.args.token, l.args.amount)),
    ...swapPushes.map((l) => ev('swap-in', l, l.args.token, l.args.amount)),
    ...dockedMine.map((l) => ev('dock', l)),
  ].sort((a, b) =>
    a.blockNumber === b.blockNumber ? a.logIndex - b.logIndex : Number(a.blockNumber - b.blockNumber),
  );

  return {
    strategyHash: hash,
    status,
    legA: legStateA,
    legB: legStateB,
    aaveYieldTotal: legStateA.aaveYield + legStateB.aaveYield,
    aquaPnl,
    quote: { probeAmount, aToB, bToA },
    pegDeviationBps,
    swaps: {
      pulled: pulledMine.reduce((s, l) => s + (l.args.amount ?? 0n), 0n),
      pushed: swapPushes.reduce((s, l) => s + (l.args.amount ?? 0n), 0n),
      count: pulledMine.length,
    },
    activity,
  };
}

function ev(
  kind: PositionEvent['kind'],
  log: { blockNumber: bigint | null; transactionHash: Hex | null; logIndex: number | null },
  token?: Address,
  amount?: bigint,
): PositionEvent {
  return {
    kind,
    blockNumber: log.blockNumber ?? 0n,
    txHash: log.transactionHash ?? ('0x' as Hex),
    logIndex: log.logIndex ?? 0,
    token,
    amount,
  };
}
