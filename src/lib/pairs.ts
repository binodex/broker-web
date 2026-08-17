import type { BinaryPair } from "@/lib/types";

export const PAIR_CATS = [
  { id: "all", label: "All" },
  { id: "cryptocurrency", label: "Crypto" },
  { id: "currency", label: "Forex" },
  { id: "stock", label: "Stocks" },
  { id: "index", label: "Indices" },
  { id: "commodity", label: "Commodities" },
] as const;

export type PairCat = (typeof PAIR_CATS)[number]["id"];
export type PayoutFloor = 0 | 80 | 90;
export type PairSortKey = "payout" | "symbol";
export type SortDir = "asc" | "desc";
export type OtcFilter = "all" | "otc" | "real";

export function catOf(pair: BinaryPair): Exclude<PairCat, "all"> {
  if (pair.type === "cryptocurrency") return "cryptocurrency";
  if (pair.type === "stock") return "stock";
  if (pair.type === "index") return "index";
  if (pair.type === "commodity") return "commodity";
  return "currency";
}

export function filterPairs(
  assets: BinaryPair[],
  input: {
    query: string;
    cat: PairCat;
    otc?: OtcFilter;
    payout: PayoutFloor;
    sort: PairSortKey;
    dir: SortDir;
  },
) {
  const q = input.query.trim().toLowerCase();
  const market = input.otc ?? "all";
  const rows = assets.filter((item) => {
    if (q && !item.symbol.toLowerCase().includes(q)) return false;
    if (market === "otc" && !item.is_otc) return false;
    if (market === "real" && item.is_otc) return false;
    if (input.cat !== "all" && catOf(item) !== input.cat) {
      return false;
    }
    if (item.payout < input.payout) return false;
    return true;
  });
  const sign = input.dir === "asc" ? 1 : -1;
  rows.sort((a, b) => {
    if (input.sort === "symbol") {
      return a.symbol.localeCompare(b.symbol) * sign;
    }
    if (a.payout !== b.payout) return (a.payout - b.payout) * sign;
    return a.symbol.localeCompare(b.symbol);
  });
  return rows;
}

export function hasOtc(assets: BinaryPair[]) {
  return assets.some((item) => item.is_otc);
}

export function hasReal(assets: BinaryPair[]) {
  return assets.some((item) => !item.is_otc);
}

export function presentCats(assets: BinaryPair[]) {
  const seen = new Set<PairCat>(["all"]);
  for (const item of assets) {
    seen.add(catOf(item));
  }
  return PAIR_CATS.filter((item) => seen.has(item.id));
}
