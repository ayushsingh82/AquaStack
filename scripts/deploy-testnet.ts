/**
 * Deploy the Aqua stack (AquaRouter + AquaSwapVMRouter) to any EVM RPC.
 *
 * Works identically against a local anvil fork of Base Sepolia and against
 * real Base Sepolia — only RPC + PK change. Writes deployments/<chainId>.json.
 *
 *   RPC=http://localhost:8545 PK=0x<deployer> npx tsx scripts/deploy-testnet.ts
 *
 * Contract artifacts (bytecode + abi) are vendored in scripts/testnet-artifacts/,
 * compiled from 1inch/aqua@main and 1inch/swap-vm@v1.0.2 (opcode set matches
 * @1inch/swap-vm-sdk@0.4.1 — verified in the Phase A spike).
 */
import { promises as fs, readFileSync } from 'node:fs';
import path from 'node:path';
import {
  createPublicClient, createWalletClient, http, type Address, type Hex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

const artifact = (name: string) =>
  JSON.parse(readFileSync(path.join(__dirname, 'testnet-artifacts', `${name}.json`), 'utf8')) as {
    abi: unknown[];
    bytecode: string;
  };
const AquaRouter = artifact('AquaRouter');
const AquaSwapVMRouter = artifact('AquaSwapVMRouter');

const RPC = process.env.RPC || 'http://localhost:8545';
const PK = (process.env.PK ||
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80') as Hex;
const WETH = '0x4200000000000000000000000000000000000006' as Address; // OP-stack predeploy (Base + Base Sepolia)
const ROUTER_NAME = 'AquaSwapVMRouter';
const ROUTER_VERSION = '1.0.2';

const account = privateKeyToAccount(PK);
const pub = createPublicClient({ transport: http(RPC) });
const wallet = createWalletClient({ account, transport: http(RPC) });

async function deploy(name: string, artifact: { abi: unknown[]; bytecode: string }, args: unknown[]) {
  const hash = await wallet.deployContract({
    abi: artifact.abi as never,
    bytecode: artifact.bytecode as Hex,
    args: args as never,
    chain: null,
  });
  const receipt = await pub.waitForTransactionReceipt({ hash });
  if (receipt.status !== 'success' || !receipt.contractAddress) {
    throw new Error(`${name} deploy failed (${hash})`);
  }
  console.log(`  ${name.padEnd(18)} ${receipt.contractAddress}  (gas ${receipt.gasUsed})`);
  return receipt.contractAddress;
}

async function main() {
  const chainId = await pub.getChainId();
  const owner = (process.env.OWNER as Address) || account.address;
  console.log(`\nDeploying Aqua stack → chain ${chainId} @ ${RPC}`);
  console.log(`  deployer ${account.address}  owner ${owner}\n`);

  const aqua = await deploy('AquaRouter', AquaRouter, [owner]);
  const router = await deploy('AquaSwapVMRouter', AquaSwapVMRouter, [
    aqua, WETH, owner, ROUTER_NAME, ROUTER_VERSION,
  ]);

  const block = await pub.getBlockNumber();
  const out = {
    chainId,
    rpc: RPC.startsWith('http://localhost') ? 'local-fork' : RPC,
    deployedAtBlock: block.toString(),
    deployedAt: new Date().toISOString(),
    aqua,
    aquaSwapVMRouter: router,
    weth: WETH,
  };
  const dir = path.join(process.cwd(), 'deployments');
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, `${chainId}.json`);
  await fs.writeFile(file, JSON.stringify(out, null, 2) + '\n');
  console.log(`\n  → ${path.relative(process.cwd(), file)}\n`);
  console.log('  Set in .env:');
  console.log(`    NEXT_PUBLIC_AQUA=${aqua}`);
  console.log(`    NEXT_PUBLIC_AQUA_SWAP_VM_ROUTER=${router}\n`);
}

main().catch((e) => {
  console.error('\nFATAL:', e);
  process.exit(1);
});
