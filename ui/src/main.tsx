import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

import '@rainbow-me/rainbowkit/styles.css';
import {
  getDefaultConfig,
  RainbowKitProvider,
  darkTheme
} from '@rainbow-me/rainbowkit';
import { WagmiProvider } from 'wagmi';
import {
  arbitrumSepolia,
  base,
  baseSepolia,
  hardhat,
  localhost,
  mainnet,
  sepolia,
  type Chain,
} from 'wagmi/chains';
import {
  QueryClientProvider,
  QueryClient,
} from "@tanstack/react-query";

const projectId = import.meta.env.VITE_RAINBOW_PROJECT_ID || '0227bb3c3c788df7908b9cbfdec19e07';

const CHAINS: Record<number, Chain> = {
  1: mainnet,
  31337: hardhat,
  8453: base,
  84532: baseSepolia,
  11155111: sepolia,
  421614: arbitrumSepolia,
};

function chainsFromEnv(): [Chain, ...Chain[]] {
  const raw = (import.meta.env.VITE_CHAIN_IDS || import.meta.env.VITE_CHAIN_ID || '84532') as string;
  const ids = raw.split(',').map((s: string) => Number(s.trim())).filter((n: number) => Number.isFinite(n));
  const selected = ids.map((id) => CHAINS[id]).filter(Boolean) as Chain[];
  if (selected.length === 0) {
    return [baseSepolia];
  }
  if (import.meta.env.DEV && !selected.some((c) => c.id === localhost.id || c.id === hardhat.id)) {
    selected.push(localhost);
  }
  return selected as [Chain, ...Chain[]];
}

const config = getDefaultConfig({
  appName: 'Prime Invoice',
  projectId: projectId,
  chains: chainsFromEnv(),
  ssr: false,
});

const queryClient = new QueryClient();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider theme={darkTheme({
          accentColor: '#10b981', // Emerald green to match our brand
          accentColorForeground: 'white',
          borderRadius: 'medium',
        })}>
          <App />
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  </StrictMode>,
)
