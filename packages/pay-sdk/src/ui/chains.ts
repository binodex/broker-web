const CHAIN_NAMES: Record<string, string> = {
  bsc: "BSC",
  eth: "Ethereum",
  polygon: "Polygon",
  arbitrum: "Arbitrum",
  optimism: "Optimism",
  base: "Base",
  solana: "Solana",
  tron: "Tron",
  bitcoin: "Bitcoin",
  ton: "TON",
  sui: "Sui",
};

const EXPLORERS: Record<string, string> = {
  eth: "https://etherscan.io/tx/",
  bsc: "https://bscscan.com/tx/",
  polygon: "https://polygonscan.com/tx/",
  arbitrum: "https://arbiscan.io/tx/",
  optimism: "https://optimistic.etherscan.io/tx/",
  base: "https://basescan.org/tx/",
  solana: "https://solscan.io/tx/",
  tron: "https://tronscan.org/#/transaction/",
  bitcoin: "https://mempool.space/tx/",
};

const TX_HASH = /^[A-Za-z0-9]{16,128}$/;

export const chainName = (chainId: string): string =>
  CHAIN_NAMES[chainId] ?? chainId.charAt(0).toUpperCase() + chainId.slice(1);

export const explorerUrl = (chainId: string, hash: string | null): string | null => {
  if (!hash || !TX_HASH.test(hash)) return null;
  const base = EXPLORERS[chainId];
  return base ? `${base}${hash}` : null;
};

export const orderBy = <T,>(items: readonly T[], key: (item: T) => string, order: readonly string[]): T[] => {
  const rank = (item: T) => {
    const index = order.indexOf(key(item));
    return index === -1 ? order.length : index;
  };
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => rank(a.item) - rank(b.item) || a.index - b.index)
    .map(({ item }) => item);
};
