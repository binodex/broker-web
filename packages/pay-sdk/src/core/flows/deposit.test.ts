import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CONTEXT,
  DEPOSIT_METHODS,
  createFakeFetch,
  cryptoDeposit,
  fiatDeposit,
  json,
  sessionSpy,
  type FakeReply,
  type FakeRequest,
} from "../../../test/pay-api.js";
import { createPayClient } from "../client.js";
import type { PayEvent } from "../events.js";
import { createDepositFlow } from "./deposit.js";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

const setup = (extra: (request: FakeRequest) => FakeReply | undefined = () => undefined) => {
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
      case "GET /broker/pay/onramp/session":
        return json(200, { url: "https://buy.onramper.com/?sig=1", single_use: true });
      case "GET /broker/pay/deposits/quote":
        return json(200, {
          method_id: "fiat:ru:sbp",
          amount: request.url.searchParams.get("amount"),
          currency: "RUB",
          estimated_usd: "51.20",
          displayed_commission_pct: "5",
          min_amount: "500",
          max_amount: "300000",
        });
      default:
        return undefined;
    }
  });
  const events: PayEvent[] = [];
  const client = createPayClient({
    mode: "deposit",
    createSession: sessionSpy(),
    fetch: api.fetch,
    onEvent: (event) => events.push(event),
  });
  const flow = createDepositFlow(client);
  return { api, client, flow, events };
};

describe("deposit flow", () => {
  it("loads context and methods and creates nothing on start", async () => {
    const { api, flow, client } = setup();
    flow.actions.start();
    flow.actions.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(flow.getSnapshot().step).toBe("pick-method");
    expect(flow.getSnapshot().methods?.methods.map((method) => method.id)).toEqual([
      "crypto:bsc:usdt",
      "crypto:tron:usdt",
      "fiat:ru:sbp",
      "fiat:ua:default",
      "onramp:card",
    ]);
    expect(api.calls("/broker/pay/context")).toHaveLength(1);
    expect(api.requests.filter((entry) => entry.method === "POST" && entry.path.startsWith("/broker/pay"))).toHaveLength(0);
    flow.actions.destroy();
    client.destroy();
  });

  it("reuses an active crypto address per route and dedupes double clicks", async () => {
    const { api, flow, client, events } = setup();
    flow.actions.start();
    await vi.advanceTimersByTimeAsync(0);
    flow.actions.selectMethod("crypto:bsc:usdt");
    flow.actions.selectMethod("crypto:bsc:usdt");
    await vi.advanceTimersByTimeAsync(0);
    expect(flow.getSnapshot().step).toBe("crypto-address");
    expect(api.calls("/broker/pay/deposits/crypto")).toHaveLength(1);
    expect(api.calls("/broker/pay/deposits/crypto")[0]?.body).toEqual({ chain_id: "bsc", currency: "USDT" });

    flow.actions.back();
    flow.actions.selectMethod("crypto:bsc:usdt");
    await vi.advanceTimersByTimeAsync(0);
    expect(api.calls("/broker/pay/deposits/crypto")).toHaveLength(1);
    expect(events.filter((event) => event.type === "deposit.created")).toHaveLength(1);
    flow.actions.destroy();
    client.destroy();
  });

  it("debounces quotes by 400 ms and hints limits before calling the server", async () => {
    const { api, flow, client } = setup();
    flow.actions.start();
    await vi.advanceTimersByTimeAsync(0);
    flow.actions.selectMethod("fiat:ru:sbp");
    flow.actions.setAmount("1");
    flow.actions.setAmount("10");
    expect(flow.getSnapshot().amountError?.code).toBe("AMOUNT_TOO_SMALL");
    flow.actions.setAmount("5000");
    flow.actions.setAmount("50000");
    await vi.advanceTimersByTimeAsync(399);
    expect(api.calls("/broker/pay/deposits/quote")).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(api.calls("/broker/pay/deposits/quote")).toHaveLength(1);
    expect(api.calls("/broker/pay/deposits/quote")[0]?.url.searchParams.get("amount")).toBe("50000");
    expect(flow.getSnapshot().quote?.estimatedUsd).toBe("51.20");
    flow.actions.destroy();
    client.destroy();
  });

  it("reuses the idempotency key for a retried submit and rotates it when the amount changes", async () => {
    let fail = true;
    const { api, flow, client, events } = setup((request) => {
      if (request.method === "POST" && request.path === "/broker/pay/deposits") {
        return fail ? "network-error" : json(201, fiatDeposit());
      }
      return undefined;
    });
    flow.actions.start();
    await vi.advanceTimersByTimeAsync(0);
    flow.actions.selectMethod("fiat:ru:sbp");
    flow.actions.setAmount("5000");
    await flow.actions.submit();
    expect(flow.getSnapshot().submitError?.code).toBe("NETWORK_ERROR");
    await flow.actions.submit();
    const firstKeys = api
      .calls("/broker/pay/deposits", "POST")
      .map((entry) => entry.headers["idempotency-key"]);
    expect(new Set(firstKeys).size).toBe(1);

    flow.actions.setAmount("6000");
    fail = false;
    await flow.actions.submit();
    const keys = api.calls("/broker/pay/deposits", "POST").map((entry) => entry.headers["idempotency-key"]);
    expect(keys.at(-1)).not.toBe(firstKeys[0]);
    expect(api.calls("/broker/pay/deposits", "POST").at(-1)?.body).toEqual({
      method_id: "fiat:ru:sbp",
      amount: "6000",
    });
    expect(flow.getSnapshot().step).toBe("requisites");
    expect(flow.getSnapshot().view?.kind).toBe("requisites");
    expect(events.some((event) => event.type === "deposit.created")).toBe(true);
    flow.actions.destroy();
    client.destroy();
  });

  it("polls the deposit every 5 s and finishes on a terminal status", async () => {
    let status = "pending";
    const { api, flow, client, events } = setup((request) => {
      if (request.method === "POST" && request.path === "/broker/pay/deposits") return json(201, fiatDeposit());
      if (request.path === "/broker/pay/deposits/dep_ru_1") return json(200, fiatDeposit({ status }));
      return undefined;
    });
    flow.actions.start();
    await vi.advanceTimersByTimeAsync(0);
    flow.actions.selectMethod("fiat:ru:sbp");
    flow.actions.setAmount("5000");
    await flow.actions.submit();
    await vi.advanceTimersByTimeAsync(5000);
    expect(api.calls("/broker/pay/deposits/dep_ru_1")).toHaveLength(1);
    status = "completed";
    await vi.advanceTimersByTimeAsync(5000);
    expect(flow.getSnapshot().step).toBe("done");
    expect(flow.getSnapshot().outcome).toBe("completed");
    expect(events.some((event) => event.type === "deposit.status")).toBe(true);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(api.calls("/broker/pay/deposits/dep_ru_1")).toHaveLength(2);
    flow.actions.destroy();
    client.destroy();
  });

  it("never reports success from a consumed crypto session", async () => {
    let status = "active";
    const { flow, client, events } = setup((request) =>
      request.path === "/broker/pay/deposits/dep_crypto_1" ? json(200, cryptoDeposit({ status })) : undefined,
    );
    flow.actions.start();
    await vi.advanceTimersByTimeAsync(0);
    flow.actions.selectMethod("crypto:bsc:usdt");
    await vi.advanceTimersByTimeAsync(0);
    status = "consumed";
    await vi.advanceTimersByTimeAsync(5000);
    expect(flow.getSnapshot().step).toBe("crypto-address");
    expect(flow.getSnapshot().outcome).toBeNull();
    expect(events.some((event) => event.type === "deposit.credited")).toBe(false);
    flow.actions.destroy();
    client.destroy();
  });

  it("emits deposit.credited from the activity feed once per payment", async () => {
    let deposits: unknown[] = [];
    const { api, flow, client, events } = setup((request) =>
      request.path === "/broker/pay/activity"
        ? json(200, { server_time: Date.now(), deposits, withdrawals: [] })
        : undefined,
    );
    flow.actions.start();
    await vi.advanceTimersByTimeAsync(0);
    flow.actions.selectMethod("crypto:bsc:usdt");
    await vi.advanceTimersByTimeAsync(10_000);
    expect(api.calls("/broker/pay/activity")).toHaveLength(1);
    const since = Number(api.calls("/broker/pay/activity")[0]?.url.searchParams.get("since"));
    deposits = [{ payment_id: 222333, amount_usd: "51.20", source: "crypto", credited_at: since + 5 }];
    await vi.advanceTimersByTimeAsync(10_000);
    await vi.advanceTimersByTimeAsync(10_000);
    const credited = events.filter((event) => event.type === "deposit.credited");
    expect(credited).toHaveLength(1);
    expect(credited[0]).toMatchObject({ paymentId: 222333, amountUsd: "51.20", source: "client" });
    expect(flow.getSnapshot().step).toBe("done");
    expect(flow.getSnapshot().outcome).toBe("credited");
    flow.actions.destroy();
    client.destroy();
  });

  it("fetches the single-use onramp URL once", async () => {
    const { api, flow, client } = setup();
    flow.actions.start();
    await vi.advanceTimersByTimeAsync(0);
    flow.actions.selectMethod("onramp:card");
    void flow.actions.loadOnramp();
    void flow.actions.loadOnramp();
    await vi.advanceTimersByTimeAsync(0);
    expect(api.calls("/broker/pay/onramp/session")).toHaveLength(1);
    expect(flow.getSnapshot().onrampUrl).toBe("https://buy.onramper.com/?sig=1");
    flow.actions.destroy();
    client.destroy();
  });

  it("asks for a fresh single-use onramp URL after leaving it and drops a late answer", async () => {
    let issued = 0;
    let hold: ((reply: Response) => void) | null = null;
    const { api, flow, client } = setup((request) => {
      if (request.path !== "/broker/pay/onramp/session") return undefined;
      issued += 1;
      const body = { url: `https://buy.onramper.com/?sig=${issued}`, single_use: true };
      if (issued === 2) return new Promise<Response>((resolve) => (hold = () => resolve(json(200, body))));
      return json(200, body);
    });
    flow.actions.start();
    await vi.advanceTimersByTimeAsync(0);
    flow.actions.selectMethod("onramp:card");
    void flow.actions.loadOnramp();
    await vi.advanceTimersByTimeAsync(0);
    expect(flow.getSnapshot().onrampUrl).toBe("https://buy.onramper.com/?sig=1");
    flow.actions.selectMethod("onramp:card");
    expect(flow.getSnapshot().onrampUrl).toBe("https://buy.onramper.com/?sig=1");
    flow.actions.back();
    expect(flow.getSnapshot().onrampUrl).toBeNull();
    flow.actions.selectMethod("onramp:card");
    void flow.actions.loadOnramp();
    await vi.advanceTimersByTimeAsync(0);
    flow.actions.selectMethod("fiat:ua:default");
    hold!(new Response());
    await vi.advanceTimersByTimeAsync(0);
    expect(flow.getSnapshot().onrampUrl).toBeNull();
    expect(flow.getSnapshot().onrampLoading).toBe(false);
    flow.actions.selectMethod("onramp:card");
    void flow.actions.loadOnramp();
    await vi.advanceTimersByTimeAsync(0);
    expect(api.calls("/broker/pay/onramp/session")).toHaveLength(3);
    expect(flow.getSnapshot().onrampUrl).toBe("https://buy.onramper.com/?sig=3");
    flow.actions.destroy();
    client.destroy();
  });

  it("stops all polling on destroy", async () => {
    const { api, flow, client } = setup();
    flow.actions.start();
    await vi.advanceTimersByTimeAsync(0);
    flow.actions.selectMethod("crypto:bsc:usdt");
    await vi.advanceTimersByTimeAsync(0);
    flow.actions.destroy();
    const before = api.requests.length;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(api.requests.length).toBe(before);
    client.destroy();
  });
});
