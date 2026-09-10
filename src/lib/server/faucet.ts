import 'server-only';
import {
  keccak256, encodeAbiParameters, parseAbiParameters, pad, toHex, parseAbi,
  type Address, type Hex,
} from 'viem';
import { publicClient } from './client';

const ERC20 = parseAbi(['function balanceOf(address) view returns (uint256)']);

/**
 * Give `holder` `amount` of `token` on an anvil / Tenderly-style fork by
 * brute-forcing the ERC20 balance storage slot and overriding it.
 * Only works against a fork RPC (anvil_setStorageAt / tenderly_setStorageAt).
 */
export async function dealErc20(token: Address, holder: Address, amount: bigint): Promise<void> {
  const bal = () =>
    publicClient.readContract({ address: token, abi: ERC20, functionName: 'balanceOf', args: [holder] }) as Promise<bigint>;

  const slots = [9, 0, 1, 2, 3, 4, 5, 6, 7, 8, 51, 52];
  for (const slot of slots) {
    const key = keccak256(
      encodeAbiParameters(parseAbiParameters('address, uint256'), [holder, BigInt(slot)]),
    ) as Hex;
    const before = await publicClient.getStorageAt({ address: token, slot: key });
    await publicClient.request({
      method: 'anvil_setStorageAt' as never,
      params: [token, key, pad(toHex(amount), { size: 32 })] as never,
    });
    if ((await bal()) === amount) return;
    // restore and try the next slot
    await publicClient.request({
      method: 'anvil_setStorageAt' as never,
      params: [token, key, (before ?? pad('0x0', { size: 32 })) as Hex] as never,
    });
  }
  throw new Error(`could not locate the balance slot for ${token}`);
}
