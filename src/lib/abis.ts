/** Minimal ABIs for client-side reads (viem parseAbi is client-safe). */
import { parseAbi } from 'viem';

export const ERC20_READ_ABI = parseAbi([
  'function balanceOf(address) view returns (uint256)',
  'function decimals() view returns (uint8)',
]);

export const AAVE_INDEX_ABI = parseAbi([
  'function getReserveNormalizedIncome(address asset) view returns (uint256)',
]);
