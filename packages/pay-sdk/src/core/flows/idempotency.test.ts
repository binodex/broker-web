import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CONTEXT,
  DEPOSIT_METHODS,
  WITHDRAW_CONTEXT,
  WITHDRAW_METHODS,
  createFakeFetch,
  cryptoDeposit,
  fiatDeposit,
  json,
  payError,
  sessionSpy,
  withdrawal,
  type FakeReply,
  type FakeRequest,
} from "../../../test/pay-api.js";
import { createPayClient } from "../client.js";
import { PayError } from "../errors.js";
import { canonicalBody, createIntentKeys, keepsIntentKey } from "../intent.js";
import { createDepositFlow } from "./deposit.js";
import { createWithdrawFlow } from "./withdraw.js";

const ADDRESS = "0x52908400098527886E0F7030069857D2E4169EE7";
const quote = (fee: string) => ({
  quote: { fee_usd: fee, receive_amount: "99.55", receive_amount_usd: "99.55", eta_seconds: 90, slippage_pct: null },
  slippage_warning: null,
});

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("intent keys", () => {
  it("hash the canonical body regardless of key order and undefined fields", () => {
    expect(canonicalBody({ b: 1, a: { d: 2, c: undefined } })).toBe(canonicalBody({ a: { d: 2 }, b: 1 }));
  });

  it("keep the key only after network errors, 5xx and IDEMPOTENCY_IN_PROGRESS", () => {
    expect(keepsIntentKey(new TypeError("Failed to fetch"))).toBe(true);
    expect(keepsIntentKey(new PayError("NETWORK_ERROR"))).toBe(true);
    expect(keepsIntentKey(new PayError("PROVIDER_UNAVAILABLE", "x", { status: 503 }))).toBe(true);
    expect(keepsIntentKey(new PayError("INTERNAL_ERROR", "x", { status: 500 }))).toBe(true);
    expect(keepsIntentKey(new PayError("IDEMPOTENCY_IN_PROGRESS", "x", { status: 409 }))).toBe(true);
    for (const [code, status] of [
      ["VALIDATION_FAILED", 400],
      ["INSUFFICIENT_BALANCE", 400],
      ["TWO_FA_INVALID", 400],
      ["RATE_LIMITED", 429],
      ["IDEMPOTENCY_CONFLICT", 409],
      ["SESSION_FAILED", 401],
    ] as const) {
      expect(keepsIntentKey(new PayError(code, "x", { status }))).toBe(false);
    }
  });

  it("reuse a key for the identical body only", () => {
    const keys = createIntentKeys();
    const first = keys.keyFor({ amount: "1" });
    keys.settle({ ok: false, error: new PayError("NETWORK_ERROR") });
    expect(keys.keyFor({ amount: "1" })).toBe(first);
    expect(keys.keyFor({ amount: "2" })).not.toBe(first);
    expect(keys.keyFor({ amount: "1" })).not.toBe(first);
  });
});

const withdrawSetup = (create: (request: FakeRequest) => FakeReply | undefined, context: unknown = WITHDRAW_CONTEXT) => {
  let fee = "0.45";
  const api = createFakeFetch((request) => {
    if (request.method === "POST" && request.path === "/broker/pay/withdrawals") {
      const reply = create(request);
      if (reply !== undefined) return reply;
    }
    switch (`${request.method} ${request.path}`) {
      case "GET /broker/pay/context":
        return json(200, typeof context === "function" ? (context as () => unknown)() : context);
      case "GET /broker/pay/methods":
        return json(200, WITHDRAW_METHODS);
      case "POST /broker/pay/withdrawals/quote":
        return json(200, quote(fee));
      case "POST /broker/pay/withdrawals":
        return json(201, withdrawal());
      default:
        if (request.path.startsWith("/broker/pay/withdrawals/")) {
          return json(200, withdrawal({ id: request.path.split("/").pop() }));
        }
        return undefined;
    }
  });
  const client = createPayClient({ mode: "withdraw", createSession: sessionSpy(), fetch: api.fetch });
  const flow = createWithdrawFlow(client);
  const keys = () => api.calls("/broker/pay/withdrawals", "POST").map((entry) => entry.headers["idempotency-key"]);
  const ready = async () => {
    flow.actions.start();
    await vi.advanceTimersByTimeAsync(0);
    flow.actions.setAddress(ADDRESS);
    flow.actions.setAmount("100");
    await vi.advanceTimersByTimeAsync(400);
  };
  return { api, client, flow, keys, ready, setFee: (value: string) => (fee = value) };
};

describe("withdraw idempotency lifecycle", () => {
  it("rotates the key after a cached 4xx even when the body is identical", async () => {
    let calls = 0;
    const t = withdrawSetup(() => (++calls === 1 ? payError(400, "INSUFFICIENT_BALANCE") : undefined));
    await t.ready();
    await t.flow.actions.submit();
    expect(t.flow.getSnapshot().submitError?.code).toBe("INSUFFICIENT_BALANCE");
    await t.flow.actions.submit();
    const [first, second] = t.keys();
    expect(first).toBeTruthy();
    expect(second).not.toBe(first);
    t.flow.actions.destroy();
    t.client.destroy();
  });

  it("reuses the key after a network error only while the body is identical", async () => {
    let fail = 2;
    const t = withdrawSetup((request) => (fail > 0 && request.base.includes("binodex") ? (fail--, "network-error") : undefined));
    await t.ready();
    await t.flow.actions.submit();
    expect(t.flow.getSnapshot().submitError?.code).toBe("NETWORK_ERROR");
    await t.flow.actions.submit();
    const keys = t.keys();
    expect(new Set(keys).size).toBe(1);
    t.flow.actions.destroy();
    t.client.destroy();
  });

  it("rotates the key when only the quote changed", async () => {
    let fail = true;
    const t = withdrawSetup(() => (fail ? payError(503, "PROVIDER_UNAVAILABLE") : undefined));
    await t.ready();
    await t.flow.actions.submit();
    t.setFee("0.60");
    t.flow.actions.requote();
    await vi.advanceTimersByTimeAsync(0);
    expect(t.flow.getSnapshot().quote?.feeUsd).toBe("0.60");
    fail = false;
    await t.flow.actions.submit();
    const [first, second] = t.keys();
    expect(second).not.toBe(first);
    expect(t.api.calls("/broker/pay/withdrawals", "POST")[1]?.body).toMatchObject({ quote: { fee_usd: "0.60" } });
    t.flow.actions.destroy();
    t.client.destroy();
  });

  it("keeps the key after IDEMPOTENCY_IN_PROGRESS", async () => {
    let calls = 0;
    const t = withdrawSetup(() => (++calls === 1 ? payError(409, "IDEMPOTENCY_IN_PROGRESS") : undefined));
    await t.ready();
    await t.flow.actions.submit();
    await t.flow.actions.submit();
    const [first, second] = t.keys();
    expect(second).toBe(first);
    t.flow.actions.destroy();
    t.client.destroy();
  });

  it("on IDEMPOTENCY_CONFLICT reloads the context and shows the in-flight withdrawal", async () => {
    let loads = 0;
    const t = withdrawSetup(
      () => payError(409, "IDEMPOTENCY_CONFLICT"),
      () => {
        loads += 1;
        return { ...WITHDRAW_CONTEXT, withdrawal: { two_factor_required: false, in_flight_id: loads > 1 ? "wd_42" : null } };
      },
    );
    await t.ready();
    await t.flow.actions.submit();
    await vi.advanceTimersByTimeAsync(0);
    expect(loads).toBe(2);
    expect(t.flow.getSnapshot().step).toBe("status");
    expect(t.flow.getSnapshot().withdrawal?.id).toBe("wd_42");
    t.flow.actions.destroy();
    t.client.destroy();
  });

  it("sends one POST for a double click", async () => {
    const t = withdrawSetup(() => undefined);
    await t.ready();
    const first = t.flow.actions.submit();
    const second = t.flow.actions.submit();
    await Promise.all([first, second]);
    expect(t.keys()).toHaveLength(1);
    t.flow.actions.destroy();
    t.client.destroy();
  });
});

const depositSetup = (extra: (request: FakeRequest) => FakeReply | undefined = () => undefined) => {
  const api = createFakeFetch((request) => {
    const custom = extra(request);
    if (custom !== undefined) return custom;
    switch (`${request.method} ${request.path}`) {
      case "GET /broker/pay/context":
        return json(200, { ...CONTEXT, server_time: Date.now() });
      case "GET /broker/pay/methods":
        return json(200, DEPOSIT_METHODS);
      case "GET /broker/pay/activity":
        return json(200, { server_time: Date.now(), deposits: [], withdrawals: [] });
      case "POST /broker/pay/deposits/crypto":
        return json(201, cryptoDeposit());
      case "GET /broker/pay/deposits/dep_crypto_1":
        return json(200, cryptoDeposit());
      case "POST /broker/pay/deposits":
        return json(201, fiatDeposit());
      case "GET /broker/pay/deposits/dep_ru_1":
        return json(200, fiatDeposit());
      default:
        return undefined;
    }
  });
  const client = createPayClient({ mode: "deposit", createSession: sessionSpy(), fetch: api.fetch });
  const flow = createDepositFlow(client);
  const keys = () => api.calls("/broker/pay/deposits", "POST").map((entry) => entry.headers["idempotency-key"]);
  return { api, client, flow, keys };
};

describe("deposit idempotency lifecycle and flow boundaries", () => {
  it("rotates after a cached 4xx and keeps after a 5xx", async () => {
    const replies = [payError(400, "AMOUNT_TOO_LARGE", { max: "300000", currency: "RUB" }), payError(500, "INTERNAL_ERROR")];
    const t = depositSetup((request) =>
      request.method === "POST" && request.path === "/broker/pay/deposits" ? replies.shift() : undefined,
    );
    t.flow.actions.start();
    await vi.advanceTimersByTimeAsync(0);
    t.flow.actions.selectMethod("fiat:ru:sbp");
    t.flow.actions.setAmount("5000");
    await t.flow.actions.submit();
    await t.flow.actions.submit();
    await t.flow.actions.submit();
    const [first, second, third] = t.keys();
    expect(second).not.toBe(first);
    expect(third).toBe(second);
    expect(t.flow.getSnapshot().step).toBe("requisites");
    t.flow.actions.destroy();
    t.client.destroy();
  });

  it("retry() never creates a second fiat deposit once one exists", async () => {
    const t = depositSetup();
    t.flow.actions.start();
    await vi.advanceTimersByTimeAsync(0);
    t.flow.actions.selectMethod("fiat:ru:sbp");
    t.flow.actions.setAmount("5000");
    await t.flow.actions.submit();
    expect(t.flow.getSnapshot().step).toBe("requisites");
    t.flow.actions.retry();
    await vi.advanceTimersByTimeAsync(0);
    expect(t.keys()).toHaveLength(1);
    t.flow.actions.destroy();
    t.client.destroy();
  });

  it("an unrelated crypto credit does not finish an SBP flow", async () => {
    let deposits: unknown[] = [];
    const t = depositSetup((request) =>
      request.path === "/broker/pay/activity"
        ? json(200, { server_time: Date.now(), deposits, withdrawals: [] })
        : undefined,
    );
    const credited: unknown[] = [];
    t.client.onEvent((event) => {
      if (event.type === "deposit.credited") credited.push(event);
    });
    t.flow.actions.start();
    await vi.advanceTimersByTimeAsync(0);
    t.flow.actions.selectMethod("crypto:bsc:usdt");
    await vi.advanceTimersByTimeAsync(0);
    expect(t.flow.getSnapshot().step).toBe("crypto-address");
    t.flow.actions.back();
    t.flow.actions.selectMethod("fiat:ru:sbp");
    t.flow.actions.setAmount("5000");
    await t.flow.actions.submit();
    expect(t.flow.getSnapshot().step).toBe("requisites");

    deposits = [{ payment_id: 1, amount_usd: "20.00", source: "crypto", credited_at: Date.now() }];
    await vi.advanceTimersByTimeAsync(10_000);
    expect(credited).toHaveLength(1);
    expect(t.flow.getSnapshot().step).toBe("requisites");
    expect(t.flow.getSnapshot().credited).toHaveLength(1);
    const polls = t.api.calls("/broker/pay/deposits/dep_ru_1").length;
    await vi.advanceTimersByTimeAsync(5_000);
    expect(t.api.calls("/broker/pay/deposits/dep_ru_1").length).toBeGreaterThan(polls);
    t.flow.actions.destroy();
    t.client.destroy();
  });

  it("an onramp step finishes only on an onramp credit", async () => {
    let deposits: unknown[] = [];
    const t = depositSetup((request) => {
      if (request.path === "/broker/pay/activity") return json(200, { server_time: Date.now(), deposits, withdrawals: [] });
      if (request.path === "/broker/pay/onramp/session") return json(200, { url: "https://buy.onramper.com/x", single_use: true });
      return undefined;
    });
    t.flow.actions.start();
    await vi.advanceTimersByTimeAsync(0);
    t.flow.actions.selectMethod("onramp:card");
    deposits = [{ payment_id: 1, amount_usd: "5.00", source: "card", credited_at: Date.now() }];
    await vi.advanceTimersByTimeAsync(10_000);
    expect(t.flow.getSnapshot().step).toBe("onramp");
    deposits = [{ payment_id: 2, amount_usd: "50.00", source: "onramp", credited_at: Date.now() }];
    await vi.advanceTimersByTimeAsync(10_000);
    expect(t.flow.getSnapshot().step).toBe("done");
    t.flow.actions.destroy();
    t.client.destroy();
  });
});
