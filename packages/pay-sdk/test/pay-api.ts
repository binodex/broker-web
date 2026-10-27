import { vi } from "vitest";
import type { CreateSession } from "../src/types.js";

export const API_A = "https://api.binodex.test/v1";
export const API_B = "https://api.binodex-ru.test/v1";
export const WIDGET_A = "https://binodex.test";
export const WIDGET_B = "https://binodex-ru.test";
export const CLIENT_ID = "client-1";

let sessionCounter = 0;

export const nextSession = (): string => {
  sessionCounter += 1;
  return `wss_${String(sessionCounter).padStart(43, "s")}`;
};

export const sessionResponse = (overrides: Record<string, unknown> = {}) => ({
  session: nextSession(),
  expires_in: 60,
  widget_url: `${WIDGET_A}/embed/pay?mode=deposit&client_id=${CLIENT_ID}`,
  widget_origin: WIDGET_A,
  widget_origins: [WIDGET_A, WIDGET_B],
  region: "global",
  api_base: API_A,
  api_bases: [API_A, API_B],
  pay_api: true,
  ...overrides,
});

export const sessionSpy = (overrides: Record<string, unknown> = {}) =>
  vi.fn<CreateSession>(async () => sessionResponse(overrides) as never);

export interface FakeRequest {
  url: URL;
  base: string;
  path: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

export type FakeReply = Response | "network-error" | Promise<Response | "network-error">;

export const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export const payError = (status: number, code: string, details: Record<string, unknown> = {}) =>
  json(status, { error: { message: code.toLowerCase(), details: { code, ...details } } });

const normalizeHeaders = (headers: HeadersInit | undefined): Record<string, string> => {
  const result: Record<string, string> = {};
  if (!headers) return result;
  new Headers(headers).forEach((value, key) => {
    result[key.toLowerCase()] = value;
  });
  return result;
};

const networkError = () => new TypeError("Failed to fetch");

export const createFakeFetch = (
  handler: (request: FakeRequest) => FakeReply | undefined,
) => {
  const requests: FakeRequest[] = [];
  let tokens = 0;
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const base = `${url.origin}/v1`;
    const path = url.pathname.replace(/^\/v1/, "");
    const request: FakeRequest = {
      url,
      base,
      path,
      method: (init?.method ?? "GET").toUpperCase(),
      headers: normalizeHeaders(init?.headers),
      body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
    };
    requests.push(request);
    if (init?.signal?.aborted) {
      const error = new Error("Aborted");
      error.name = "AbortError";
      throw error;
    }
    let reply = handler(request);
    if (reply === undefined) {
      if (path === "/broker/pay/ping") reply = json(200, { ok: true, server_time: Date.now() });
      else if (path === "/broker/widget-sessions/redeem") {
        tokens += 1;
        reply = json(200, {
          access_token: `token-${tokens}-${"x".repeat(24)}`,
          token_type: "Bearer",
          expires_in: 900,
          expires_at: Date.now() + 900_000,
          pay_api: true,
          api_base: API_A,
          api_bases: [API_A, API_B],
          widget_origins: [WIDGET_A, WIDGET_B],
          region: "global",
        });
      } else reply = json(404, { error: { message: "no route", details: { code: "NOT_FOUND" } } });
    }
    const resolved = await reply;
    if (resolved === "network-error") throw networkError();
    return resolved;
  });
  return {
    fetch: fetchMock as unknown as typeof fetch,
    mock: fetchMock,
    requests,
    calls: (path: string, method?: string) =>
      requests.filter((entry) => entry.path === path && (!method || entry.method === method)),
  };
};

export const CONTEXT = {
  mode: "deposit",
  server_time: 1_761_130_000_000,
  token_expires_at: 1_761_130_900_000,
  balance: { available: "125.40", held: "0.00", total: "125.40", withdrawable: "120.00", currency: "USD" },
  requisites_delivery: "raw",
  branding: { theme: "dark", accent_color: "#00c853", background_color: null, logo_url: null },
};

export const WITHDRAW_CONTEXT = {
  ...CONTEXT,
  mode: "withdraw",
  withdrawal: { two_factor_required: false, in_flight_id: null },
};

export const DEPOSIT_METHODS = {
  mode: "deposit",
  suggested_country: "RU",
  methods: [
    {
      id: "crypto:bsc:usdt",
      kind: "crypto",
      chain_id: "bsc",
      currency: "USDT",
      min_usd: "10.00",
      max_usd: "100000.00",
      min_native: null,
      max_native: null,
      fee_usd: "0.20",
      eta_seconds: 90,
      available: true,
    },
    {
      id: "crypto:tron:usdt",
      kind: "crypto",
      chain_id: "tron",
      currency: "USDT",
      min_usd: "10.00",
      max_usd: "100000.00",
      fee_usd: "1.50",
      eta_seconds: 120,
      available: true,
    },
    {
      id: "fiat:ru:sbp",
      kind: "fiat",
      rail: "ru",
      method_id: "sbp",
      label: "SBP",
      subtitle: null,
      currency: "RUB",
      min_amount: "500",
      max_amount: "300000",
      displayed_commission_pct: "5",
      requires_receipt: true,
      delivery: "requisites",
      provider: "must-not-leak",
    },
    {
      id: "fiat:ua:default",
      kind: "fiat",
      rail: "ua",
      method_id: "default",
      label: null,
      subtitle: null,
      currency: "UAH",
      min_amount: "100",
      max_amount: "50000",
      displayed_commission_pct: null,
      requires_receipt: false,
      delivery: "redirect",
    },
    { id: "onramp:card", kind: "onramp", delivery: "embed" },
  ],
  ordering: { currencies: ["USDT"], chains: ["bsc", "tron"] },
  unavailable_rails: ["kz"],
};

export const WITHDRAW_METHODS = {
  mode: "withdraw",
  suggested_country: null,
  max_withdraw_usd: "5000.00",
  methods: [
    {
      id: "crypto:bsc:usdc",
      kind: "crypto",
      chain_id: "bsc",
      currency: "USDC",
      withdrawal: {
        min_usd: "10.00",
        min_native: null,
        max_native: null,
        fee_usd: "0.45",
        eta_seconds: 90,
        max_slippage_pct: "7",
      },
    },
  ],
  ordering: { currencies: ["USDC"], chains: ["bsc"] },
  unavailable_rails: [],
};

export const cryptoDeposit = (overrides: Record<string, unknown> = {}) => ({
  id: "dep_crypto_1",
  kind: "crypto",
  chain_id: "bsc",
  currency: "USDT",
  address: "0x52908400098527886E0F7030069857D2E4169EE7",
  status: "active",
  expires_at: Date.now() + 30 * 60_000,
  created_at: Date.now(),
  ...overrides,
});

export const fiatDeposit = (overrides: Record<string, unknown> = {}) => ({
  id: "dep_ru_1",
  kind: "fiat",
  rail: "ru",
  method_id: "fiat:ru:sbp",
  status: "pending",
  amount: "5000",
  currency: "RUB",
  estimated_usd: "51.20",
  credited_usd: null,
  expires_at: Date.now() + 15 * 60_000,
  server_time: Date.now(),
  next_action: {
    type: "show_requisites",
    requisites: {
      kind: "card",
      value: "2200000000000000",
      amount: "5000.00",
      recipient_name: "IVAN I.",
      bank: "Sber",
      country: "RU",
    },
    frame: null,
  },
  receipt: { required: true, attached_at: null },
  created_at: Date.now(),
  updated_at: Date.now(),
  ...overrides,
});

export const withdrawal = (overrides: Record<string, unknown> = {}) => ({
  id: "wd_1",
  payment_id: 222334,
  status: "processing",
  display_status: "pending",
  amount_usd: "100.00",
  fee_usd: "0.45",
  receive_amount: "99.55",
  receive_amount_usd: "99.55",
  chain_id: "bsc",
  currency: "USDC",
  address: "0x52908400098527886E0F7030069857D2E4169EE7",
  destination_tx_hash: null,
  eta_seconds: 90,
  created_at: Date.now(),
  updated_at: Date.now(),
  ...overrides,
});

export const frameTicket = (overrides: Record<string, unknown> = {}) => ({
  ticket: `wft_${"t".repeat(43)}`,
  expires_in: 60,
  expires_at: Date.now() + 60_000,
  frame_origins: [WIDGET_A, WIDGET_B],
  frame_path: "/embed/pay/requisites",
  ...overrides,
});

export const flush = async (times = 5): Promise<void> => {
  for (let i = 0; i < times; i += 1) await Promise.resolve();
};
