import {
  createWalletClient, http, type Account, type Address, type Hex, type PublicClient,
} from 'viem';
import type { PositionSigner } from './types';
import type { TxStep } from '../aqua/types';

/**
 * Dev/test signer backed by a local viem account. Production swaps this for a
 * Privy-session-signer implementation of the same `PositionSigner` interface.
 */
export class LocalKeySigner implements PositionSigner {
  readonly address: Address;
  private readonly wallet;

  constructor(account: Account, rpcUrl: string, private readonly pub: PublicClient) {
    this.address = account.address;
    this.wallet = createWalletClient({ account, transport: http(rpcUrl) });
  }

  async sendStep(step: TxStep): Promise<Hex> {
    const hash = await this.wallet.sendTransaction({
      to: step.to, data: step.data, value: step.value ?? 0n, chain: null,
    });
    const receipt = await this.pub.waitForTransactionReceipt({ hash });
    if (receipt.status !== 'success') throw new Error(`unwind step reverted: ${step.label}`);
    return hash;
  }
}
