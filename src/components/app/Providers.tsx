'use client';

import { type ReactNode, useState } from 'react';
import { http } from 'viem';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PrivyProvider } from '@privy-io/react-auth';
import { WagmiProvider as PrivyWagmiProvider, createConfig as createPrivyWagmiConfig } from '@privy-io/wagmi';
import { WagmiProvider, createConfig } from 'wagmi';
import { injected } from 'wagmi/connectors';
import { forkChain } from '@/lib/chain';

export const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? '';
export const PRIVY_ENABLED = PRIVY_APP_ID.length > 0;

const privyWagmiConfig = createPrivyWagmiConfig({
  chains: [forkChain],
  transports: { [forkChain.id]: http() },
});

const injectedWagmiConfig = createConfig({
  chains: [forkChain],
  connectors: [injected()],
  transports: { [forkChain.id]: http() },
});

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  if (!PRIVY_ENABLED) {
    // No Privy configured — plain wagmi + injected wallet (fine for a fork demo).
    return (
      <WagmiProvider config={injectedWagmiConfig}>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </WagmiProvider>
    );
  }

  return (
    <PrivyProvider
      appId={PRIVY_APP_ID}
      config={{
        appearance: { theme: 'dark', accentColor: '#FD5299', walletChainType: 'ethereum-only' },
        embeddedWallets: { ethereum: { createOnLogin: 'users-without-wallets' } },
        defaultChain: forkChain,
        supportedChains: [forkChain],
      }}
    >
      <QueryClientProvider client={queryClient}>
        <PrivyWagmiProvider config={privyWagmiConfig}>{children}</PrivyWagmiProvider>
      </QueryClientProvider>
    </PrivyProvider>
  );
}
