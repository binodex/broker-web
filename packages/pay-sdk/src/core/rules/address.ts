const EVM_ADDRESS = /^0x[a-fA-F0-9]{40}$/;
const SOLANA_ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const TRON_ADDRESS = /^T[a-km-zA-HJ-NP-Z1-9]{33}$/;
const BTC_BECH32 = /^(bc1|tb1)[a-z0-9]{25,87}$/;
const BTC_LEGACY = /^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/;

export type AddressFamily = "evm" | "solana" | "tron" | "bitcoin";

export const addressFamily = (chainId: string): AddressFamily => {
  if (chainId === "bitcoin") return "bitcoin";
  if (chainId === "solana") return "solana";
  if (chainId === "tron") return "tron";
  return "evm";
};

export const isValidWithdrawAddress = (chainId: string, address: string): boolean => {
  const value = address.trim();
  if (!value) return false;
  switch (addressFamily(chainId)) {
    case "bitcoin":
      return BTC_BECH32.test(value) || BTC_LEGACY.test(value);
    case "solana":
      return SOLANA_ADDRESS.test(value);
    case "tron":
      return TRON_ADDRESS.test(value);
    default:
      return EVM_ADDRESS.test(value);
  }
};
