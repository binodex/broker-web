export type AccountMode = "demo" | "real";

export type TradeAction = "up" | "down";

export interface BrokerLevel {
  code: string;
  rank: number;
}

export interface BrokerBalance {
  available: number;
  held: number;
  total: number;
}

export interface BrokerUser {
  id: number;
  level: BrokerLevel;
  min_trade_amount: number;
  real: BrokerBalance;
  demo: BrokerBalance;
}

export interface BrokerAuthUser {
  id: number;
  email: string;
  country: string | null;
  nickname: string;
  is_verified: boolean;
  is_partner_client: boolean;
  level: BrokerLevel;
  restrictions: {
    is_islamic_account: boolean;
    can_trade: boolean;
    assets_disabled: { otc: boolean; market: boolean; list: string[] };
  };
}

export interface TokenPair {
  access_token: string;
  refresh_token: string;
  token_type: "Bearer";
  expires_in: number;
}

export interface LoginResponse extends TokenPair {
  user: BrokerAuthUser;
  avatar: string | null;
}

export interface BinaryPair {
  id: number;
  symbol: string;
  is_otc?: boolean;
  type: string;
  digits: number;
  payout: number;
  max_payout: number;
  min_timeframe: number;
  max_timeframe: number;
  scheduled_until: number;
}

export type Candle = [number, number, number, number, number, number?];

export interface OpenTrade {
  id: number;
  asset_id: number;
  action: TradeAction;
  amount: number;
  payout: number;
  potential_profit: number;
  open_price: number;
  open_timestamp: number;
  close_timestamp: number;
  is_demo?: boolean;
  source?: "api" | "platform";
  broker_client_id?: string | null;
  symbol?: string;
}

export interface ClosedTrade {
  id: number;
  asset_id: number;
  action: TradeAction;
  amount: number;
  payout: number;
  profit: number;
  open_price: number;
  open_timestamp: number;
  close_price: number;
  close_timestamp: number;
  is_demo?: boolean;
  source?: "api" | "platform";
  broker_client_id?: string | null;
  symbol?: string;
}

export interface SessionPayload {
  access_token?: string;
  user: BrokerUser;
  profile: BrokerAuthUser | null;
  client_id: string;
  ws_url: string;
  platform_url: string;
}

export interface BrokerErrorBody {
  error?: { message?: string; details?: unknown };
}
