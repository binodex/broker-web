import type { CreateSession, PayMode, PayTheme } from "../types.js";

export type { CreateSession, CreateSessionContext, PayMode, PayTheme } from "../types.js";

export type PayRegion = "ru" | "global" | "unknown";

export type FiatRail = "ru" | "kz" | "ua" | "in";

export interface Balance {
  available: string | null;
  held: string | null;
  total: string | null;
  withdrawable: string | null;
  currency: string;
}

export interface Branding {
  theme: PayTheme | null;
  accentColor: string | null;
  backgroundColor: string | null;
  logoUrl: string | null;
}

export type RequisitesDelivery = "raw" | "frame";

export interface PayContext {
  mode: PayMode;
  serverTime: number;
  tokenExpiresAt: number | null;
  balance: Balance;
  withdrawal: { twoFactorRequired: boolean; inFlightId: string | null } | null;
  requisitesDelivery: RequisitesDelivery;
  branding: Branding;
}

export interface CryptoWithdrawalLimits {
  minUsd: string;
  minNative: string | null;
  maxNative: string | null;
  feeUsd: string;
  etaSeconds: number | null;
  maxSlippagePct: string | null;
}

export interface CryptoMethod {
  id: string;
  kind: "crypto";
  chainId: string;
  currency: string;
  minUsd: string | null;
  maxUsd: string | null;
  minNative: string | null;
  maxNative: string | null;
  feeUsd: string | null;
  etaSeconds: number | null;
  available: boolean;
  withdrawal: CryptoWithdrawalLimits | null;
}

export type FiatDelivery = "requisites" | "redirect" | "qr";

export interface FiatMethod {
  id: string;
  kind: "fiat";
  rail: FiatRail;
  methodId: string;
  label: string | null;
  subtitle: string | null;
  currency: string;
  minAmount: string | null;
  maxAmount: string | null;
  displayedCommissionPct: string | null;
  requiresReceipt: boolean;
  isDefault: boolean;
  delivery: FiatDelivery;
}

export interface OnrampMethod {
  id: string;
  kind: "onramp";
  delivery: "embed";
}

export type PayMethod = CryptoMethod | FiatMethod | OnrampMethod;

export interface PayMethods {
  mode: PayMode;
  suggestedCountry: string | null;
  methods: PayMethod[];
  ordering: { currencies: string[]; chains: string[] };
  unavailableRails: string[];
  maxWithdrawUsd: string | null;
}

export interface DepositQuote {
  methodId: string;
  amount: string;
  currency: string;
  estimatedUsd: string | null;
  displayedCommissionPct: string | null;
  minAmount: string | null;
  maxAmount: string | null;
}

export type CryptoDepositStatus = "active" | "expired" | "consumed" | "closed";

export interface CryptoDeposit {
  id: string;
  kind: "crypto";
  chainId: string;
  currency: string;
  address: string;
  status: CryptoDepositStatus;
  expiresAt: number | null;
  createdAt: number;
}

export type FiatDepositStatus =
  | "pending"
  | "completed"
  | "failed"
  | "expired"
  | "disputed";

export interface Requisites {
  kind: string;
  value: string;
  amount: string;
  recipientName: string | null;
  bank: string | null;
  country: string | null;
}

export interface RequisitesFrameRef {
  origins: string[];
  path: string;
}

export type NextAction =
  | {
      type: "show_requisites";
      requisites: Requisites | null;
      frame: RequisitesFrameRef | null;
    }
  | { type: "redirect"; url: string }
  | { type: "qr"; payload: string | null; imageUrl: string | null };

export interface FiatDeposit {
  id: string;
  kind: "fiat";
  rail: FiatRail;
  methodId: string;
  status: FiatDepositStatus;
  amount: string | null;
  currency: string;
  estimatedUsd: string | null;
  creditedUsd: string | null;
  expiresAt: number | null;
  serverTime: number | null;
  nextAction: NextAction | null | undefined;
  receipt: { required: boolean; attachedAt: number | null };
  createdAt: number | null;
  updatedAt: number | null;
}

export type Deposit = CryptoDeposit | FiatDeposit;

export interface WithdrawalQuote {
  feeUsd: string | null;
  receiveAmount: string | null;
  receiveAmountUsd: string | null;
  etaSeconds: number | null;
  slippagePct: string | null;
}

export interface SlippageWarning {
  slippagePct: string | null;
  maxAllowedPct: string | null;
  receiveAmount: string | null;
  receiveAmountUsd: string | null;
}

export type WithdrawalQuoteResult =
  | { quote: WithdrawalQuote; slippageWarning: null }
  | { quote: null; slippageWarning: SlippageWarning };

export type WithdrawalStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "cancelled"
  | "refund_pending"
  | "refunded";

export type DisplayStatus = "pending" | "success" | "failed";

export interface Withdrawal {
  id: string;
  paymentId: number | null;
  status: WithdrawalStatus;
  displayStatus: DisplayStatus;
  amountUsd: string | null;
  feeUsd: string | null;
  receiveAmount: string | null;
  receiveAmountUsd: string | null;
  chainId: string | null;
  currency: string | null;
  address: string | null;
  destinationTxHash: string | null;
  etaSeconds: number | null;
  createdAt: number;
  updatedAt: number;
}

export type DepositSource = "crypto" | "card" | "onramp" | "other";

export interface CreditedDeposit {
  paymentId: number;
  amountUsd: string | null;
  source: DepositSource;
  creditedAt: number;
}

export interface WithdrawalActivity {
  paymentId: number;
  id: string;
  status: WithdrawalStatus;
  updatedAt: number;
}

export interface PayActivity {
  serverTime: number;
  deposits: CreditedDeposit[];
  withdrawals: WithdrawalActivity[];
}

export interface CreateDepositInput {
  methodId: string;
  amount: string;
  customerPhone?: string;
  returnUrl?: string;
}

export interface QuoteWithdrawalInput {
  methodId: string;
  address: string;
  amount: string;
  acceptSlippagePct?: number;
}

export interface CreateWithdrawalInput extends QuoteWithdrawalInput {
  quote?: WithdrawalQuote;
  twoFactorCode?: string;
}

export interface FrameTicket {
  ticket: string;
  expiresIn: number;
  expiresAt: number | null;
  frameOrigins: string[];
  framePath: string | null;
}

export interface PaySession {
  session: string;
  expiresIn: number | null;
  apiBases: string[];
  widgetOrigins: string[];
  region: PayRegion | null;
  payApi: boolean | null;
  clientId: string | null;
}

export interface SessionSourceOptions {
  sessionEndpoint?: string;
  createSession?: CreateSession;
}
