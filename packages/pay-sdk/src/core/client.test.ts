import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  API_A,
  API_B,
  CLIENT_ID,
  CONTEXT,
  createFakeFetch,
  json,
  payError,
  fiatDeposit,
  frameTicket,
  sessionSpy,
  withdrawal,
  type FakeRequest,
} from "../../test/pay-api.js";
import { createPayClient } from "./client.js";
import type { PayEvent } from "./events.js";

const TOKEN_PATTERN = /token-\d+-x{24}/;

const authOf = (request: FakeRequest | undefined) => request?.headers.authorization ?? null;

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("createPayClient session chain", () => {
  it("creates a session, probes the host, redeems and calls with a bearer token", async () => {
    const createSession = sessionSpy();
    const api = createFakeFetch((request) =>
      request.path === "/broker/pay/context" ? json(200, CONTEXT) : undefined,
    );
    const client = createPayClient({ mode: "deposit", createSession, fetch: api.fetch });
    const context = await client.getContext();

    expect(context.balance.withdrawable).toBe("120.00");
    expect(createSession).toHaveBeenCalledTimes(1);
    expect(api.requests.map((entry) => `${entry.method} ${entry.path}`)).toEqual([
      "GET /broker/pay/ping",
      "POST /broker/widget-sessions/redeem",
      "GET /broker/pay/context",
    ]);
    const redeem = api.calls("/broker/widget-sessions/redeem")[0];
    expect(redeem?.base).toBe(API_A);
    expect(redeem?.body).toEqual({
      session: expect.stringMatching(/^wss_/),
      origin: window.location.origin,
      client_id: CLIENT_ID,
      mode: "deposit",
    });
    expect(authOf(api.calls("/broker/pay/context")[0])).toMatch(/^Bearer token-1-/);
    expect(client.state.getSnapshot()).toEqual({ status: "ready", error: null });
    client.destroy();
  });

  it("sends requests without cookies and never caches them", async () => {
    const api = createFakeFetch((request) =>
      request.path === "/broker/pay/context" ? json(200, CONTEXT) : undefined,
    );
    const client = createPayClient({ mode: "deposit", createSession: sessionSpy(), fetch: api.fetch });
    await client.getContext();
    for (const [, init] of api.mock.mock.calls) {
      expect(init?.credentials).toBe("omit");
      expect(init?.cache).toBe("no-store");
    }
    client.destroy();
  });

  it("prefers an explicit clientId over the widget_url query", async () => {
    const api = createFakeFetch((request) =>
      request.path === "/broker/pay/context" ? json(200, CONTEXT) : undefined,
    );
    const client = createPayClient({
      mode: "deposit",
      clientId: "explicit",
      createSession: sessionSpy(),
      fetch: api.fetch,
    });
    await client.getContext();
    expect((api.calls("/broker/widget-sessions/redeem")[0]?.body as { client_id: string }).client_id).toBe(
      "explicit",
    );
    client.destroy();
  });

  it.each([
    ["pay_api is false", { pay_api: false }, "PAY_API_UNAVAILABLE"],
    ["the session has no api_base (old backend)", { api_base: undefined, api_bases: undefined, pay_api: undefined }, "PAY_API_UNAVAILABLE"],
    ["api_base is not https", { api_base: "http://api.binodex.test/v1", api_bases: ["http://api.binodex.test/v1"] }, "INVALID_API_BASE"],
    ["api_base has a foreign path", { api_base: "https://api.binodex.test/evil", api_bases: undefined }, "INVALID_API_BASE"],
  ])("never calls the pay API when %s", async (_, overrides, code) => {
    const api = createFakeFetch(() => undefined);
    const client = createPayClient({
      mode: "deposit",
      createSession: sessionSpy(overrides),
      fetch: api.fetch,
    });
    await expect(client.getContext()).rejects.toMatchObject({ code });
    expect(api.requests).toHaveLength(0);
    expect(client.state.getSnapshot().status).toBe("error");
    client.destroy();
  });

  it("enforces allowedApiOrigins against every declared host", async () => {
    const api = createFakeFetch((request) =>
      request.path === "/broker/pay/context" ? json(200, CONTEXT) : undefined,
    );
    const client = createPayClient({
      mode: "deposit",
      createSession: sessionSpy(),
      allowedApiOrigins: ["https://api.binodex-ru.test"],
      fetch: api.fetch,
    });
    await client.getContext();
    expect(new Set(api.requests.map((entry) => entry.base))).toEqual(new Set([API_B]));
    client.destroy();

    const refused = createPayClient({
      mode: "deposit",
      createSession: sessionSpy(),
      allowedApiOrigins: ["https://api.other.test"],
      fetch: api.fetch,
    });
    await expect(refused.getContext()).rejects.toMatchObject({ code: "INVALID_API_BASE" });
    refused.destroy();
  });

  it("surfaces PAY_API_DISABLED from the probe", async () => {
    const api = createFakeFetch(() => payError(404, "PAY_API_DISABLED"));
    const client = createPayClient({ mode: "deposit", createSession: sessionSpy(), fetch: api.fetch });
    await expect(client.getContext()).rejects.toMatchObject({ code: "PAY_API_DISABLED" });
    client.destroy();
  });

  it("maps a rejected redeem to SESSION_FAILED without leaking the server message", async () => {
    const api = createFakeFetch((request) =>
      request.path === "/broker/widget-sessions/redeem"
        ? json(401, { error: { message: "Invalid widget session" } })
        : undefined,
    );
    const client = createPayClient({ mode: "deposit", createSession: sessionSpy(), fetch: api.fetch });
    await expect(client.getContext()).rejects.toMatchObject({ code: "SESSION_FAILED", status: 401 });
    client.destroy();
  });
});

describe("token handling", () => {
  it("never writes the token to storage, cookies, URLs or events", async () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const cookie = vi.spyOn(document, "cookie", "set");
    const pushState = vi.spyOn(history, "pushState");
    const replaceState = vi.spyOn(history, "replaceState");
    const events: PayEvent[] = [];
    const api = createFakeFetch((request) => {
      if (request.path === "/broker/pay/context") return json(200, CONTEXT);
      if (request.path === "/broker/pay/withdrawals") return json(201, withdrawal());
      return undefined;
    });
    const client = createPayClient({
      mode: "withdraw",
      createSession: sessionSpy(),
      fetch: api.fetch,
      onEvent: (event) => events.push(event),
    });
    await client.getContext();
    await client.createWithdrawal(
      { methodId: "crypto:bsc:usdc", address: "0x52908400098527886E0F7030069857D2E4169EE7", amount: "100.00" },
      { idempotencyKey: "key-12345678" },
    );
    client.emit({ type: "close.requested" });

    expect(setItem).not.toHaveBeenCalled();
    expect(cookie).not.toHaveBeenCalled();
    expect(pushState).not.toHaveBeenCalled();
    expect(replaceState).not.toHaveBeenCalled();
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
    expect(document.cookie).not.toMatch(TOKEN_PATTERN);
    expect(window.location.href).not.toMatch(TOKEN_PATTERN);
    for (const request of api.requests) expect(request.url.toString()).not.toMatch(TOKEN_PATTERN);
    expect(events.length).toBeGreaterThan(0);
    expect(JSON.stringify(events)).not.toMatch(TOKEN_PATTERN);
    expect(JSON.stringify(client)).not.toMatch(TOKEN_PATTERN);
    expect(JSON.stringify(client.state.getSnapshot())).not.toMatch(TOKEN_PATTERN);
    for (const value of Object.values(client)) {
      if (typeof value === "string") expect(value).not.toMatch(TOKEN_PATTERN);
    }
    expect(authOf(api.calls("/broker/pay/withdrawals")[0])).toMatch(TOKEN_PATTERN);
    client.destroy();
  });

  it("renews exactly once for concurrent 401s and retries every request", async () => {
    const createSession = sessionSpy();
    let rejectFirstToken = true;
    const api = createFakeFetch((request) => {
      if (request.path === "/broker/pay/context" || request.path === "/broker/pay/methods") {
        if (rejectFirstToken && authOf(request)?.includes("token-1-")) {
          return payError(401, "UNAUTHENTICATED");
        }
        return request.path === "/broker/pay/context"
          ? json(200, CONTEXT)
          : json(200, { mode: "deposit", methods: [], ordering: {}, unavailable_rails: [] });
      }
      return undefined;
    });
    const events: PayEvent[] = [];
    const client = createPayClient({
      mode: "deposit",
      createSession,
      fetch: api.fetch,
      onEvent: (event) => events.push(event),
    });
    await client.connect();
    expect(createSession).toHaveBeenCalledTimes(1);

    const results = await Promise.all([
      client.getContext(),
      client.listMethods(),
      client.getContext(),
      client.getContext(),
    ]);
    rejectFirstToken = false;

    expect(results).toHaveLength(4);
    expect(createSession).toHaveBeenCalledTimes(2);
    expect(api.calls("/broker/widget-sessions/redeem")).toHaveLength(2);
    const retried = api.requests.filter(
      (entry) => entry.path !== "/broker/pay/ping" && authOf(entry)?.includes("token-2-"),
    );
    expect(retried.map((entry) => entry.path).sort()).toEqual([
      "/broker/pay/context",
      "/broker/pay/context",
      "/broker/pay/context",
      "/broker/pay/methods",
    ]);
    expect(events.filter((event) => event.type === "session.ready").map((event) => (event as { renewed: boolean }).renewed)).toEqual([false, true]);
    client.destroy();
  });

  it("surfaces SESSION_FAILED when the renewed token is rejected too", async () => {
    const createSession = sessionSpy();
    const api = createFakeFetch((request) =>
      request.path === "/broker/pay/context" ? payError(401, "UNAUTHENTICATED") : undefined,
    );
    const client = createPayClient({ mode: "deposit", createSession, fetch: api.fetch });
    await expect(client.getContext()).rejects.toMatchObject({ code: "SESSION_FAILED" });
    expect(createSession).toHaveBeenCalledTimes(2);
    expect(api.calls("/broker/pay/context")).toHaveLength(2);
    expect(client.state.getSnapshot().status).toBe("error");
    client.destroy();
  });

  it("does not renew on ORIGIN_MISMATCH", async () => {
    const createSession = sessionSpy();
    const api = createFakeFetch((request) =>
      request.path === "/broker/pay/context" ? payError(401, "ORIGIN_MISMATCH") : undefined,
    );
    const client = createPayClient({ mode: "deposit", createSession, fetch: api.fetch });
    await expect(client.getContext()).rejects.toMatchObject({ code: "ORIGIN_MISMATCH" });
    expect(createSession).toHaveBeenCalledTimes(1);
    client.destroy();
  });

  it("renews proactively 60 s before the token expires", async () => {
    vi.useFakeTimers();
    const createSession = sessionSpy();
    const api = createFakeFetch((request) =>
      request.path === "/broker/pay/context" ? json(200, CONTEXT) : undefined,
    );
    const client = createPayClient({ mode: "deposit", createSession, fetch: api.fetch });
    await client.getContext();
    expect(createSession).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(839_000);
    expect(createSession).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(createSession).toHaveBeenCalledTimes(2);

    await client.getContext();
    expect(authOf(api.calls("/broker/pay/context").at(-1))).toMatch(/token-2-/);
    client.destroy();
  });

  it("renews before a request when the token is inside the 60 s window", async () => {
    vi.useFakeTimers();
    const createSession = sessionSpy();
    const api = createFakeFetch((request) =>
      request.path === "/broker/pay/context" ? json(200, CONTEXT) : undefined,
    );
    const client = createPayClient({
      mode: "deposit",
      createSession,
      fetch: api.fetch,
      timers: { setTimeout: () => 0, clearTimeout: () => undefined },
    });
    await client.getContext();
    vi.setSystemTime(Date.now() + 845_000);
    await client.getContext();
    expect(createSession).toHaveBeenCalledTimes(2);
    expect(api.calls("/broker/pay/context").map((entry) => authOf(entry)?.slice(7, 14))).toEqual([
      "token-1",
      "token-2",
    ]);
    client.destroy();
  });
});

describe("host failover", () => {
  it("re-probes after a network error, switches host and retries once with the same key", async () => {
    let aDown = false;
    const api = createFakeFetch((request) => {
      if (request.base === API_A && aDown) return "network-error";
      if (request.path === "/broker/pay/withdrawals") return json(201, withdrawal());
      if (request.path === "/broker/pay/context") return json(200, CONTEXT);
      return undefined;
    });
    const client = createPayClient({ mode: "withdraw", createSession: sessionSpy(), fetch: api.fetch });
    await client.getContext();
    aDown = true;
    await client.createWithdrawal(
      { methodId: "crypto:bsc:usdc", address: "0x52908400098527886E0F7030069857D2E4169EE7", amount: "100.00" },
      { idempotencyKey: "intent-12345678" },
    );
    const creates = api.calls("/broker/pay/withdrawals", "POST");
    expect(creates.map((entry) => entry.base)).toEqual([API_A, API_B]);
    expect(creates.map((entry) => entry.headers["idempotency-key"])).toEqual([
      "intent-12345678",
      "intent-12345678",
    ]);
    expect(authOf(creates[1])).toBe(authOf(creates[0]));
    const pings = api.calls("/broker/pay/ping").map((entry) => entry.base);
    expect(pings).toEqual([API_A, API_B]);

    await client.getContext();
    expect(api.calls("/broker/pay/context").at(-1)?.base).toBe(API_B);
    client.destroy();
  });

  it("reports NETWORK_ERROR when no other host answers", async () => {
    let down = false;
    const api = createFakeFetch((request) => {
      if (down) return "network-error";
      if (request.path === "/broker/pay/context") return json(200, CONTEXT);
      return undefined;
    });
    const client = createPayClient({ mode: "deposit", createSession: sessionSpy(), fetch: api.fetch });
    await client.getContext();
    down = true;
    await expect(client.getContext()).rejects.toMatchObject({ code: "NETWORK_ERROR" });
    client.destroy();
  });

  it("redeems on the next host when the chosen one drops during redeem", async () => {
    const createSession = sessionSpy();
    const api = createFakeFetch((request) => {
      if (request.base === API_A && request.path === "/broker/widget-sessions/redeem") {
        return "network-error";
      }
      if (request.path === "/broker/pay/context") return json(200, CONTEXT);
      return undefined;
    });
    const client = createPayClient({ mode: "deposit", createSession, fetch: api.fetch });
    await client.getContext();
    expect(createSession).toHaveBeenCalledTimes(2);
    expect(api.calls("/broker/widget-sessions/redeem").map((entry) => entry.base)).toEqual([API_A, API_B]);
    expect(api.calls("/broker/pay/context")[0]?.base).toBe(API_B);
    client.destroy();
  });

  it("orders widget origins so the frame uses the proven host", async () => {
    const api = createFakeFetch((request) => {
      if (request.base === API_A) return "network-error";
      if (request.path === "/broker/pay/context") return json(200, CONTEXT);
      return undefined;
    });
    const client = createPayClient({ mode: "deposit", createSession: sessionSpy(), fetch: api.fetch });
    await client.getContext();
    expect(client.widgetOrigins()).toEqual(["https://binodex-ru.test", "https://binodex.test"]);
    client.destroy();
  });
});

describe("errors and wire mapping", () => {
  it("maps the broker error envelope to codes and sanitized details", async () => {
    const api = createFakeFetch((request) => {
      if (request.path === "/broker/pay/deposits/quote") {
        return payError(400, "AMOUNT_TOO_SMALL", { min: "500", currency: "RUB" });
      }
      if (request.path === "/broker/pay/deposits") {
        return payError(429, "RATE_LIMITED", { retry_after_seconds: 125 });
      }
      return undefined;
    });
    const client = createPayClient({ mode: "deposit", createSession: sessionSpy(), fetch: api.fetch });
    await expect(client.quoteDeposit({ methodId: "fiat:ru:sbp", amount: "10" })).rejects.toMatchObject({
      code: "AMOUNT_TOO_SMALL",
      status: 400,
      details: { min: "500", currency: "RUB" },
    });
    await expect(client.createDeposit({ methodId: "fiat:ru:sbp", amount: "1000" })).rejects.toMatchObject({
      code: "RATE_LIMITED",
      details: { retryAfterSeconds: 125 },
    });
    expect(api.calls("/broker/pay/deposits/quote")[0]?.url.search).toBe(
      "?method_id=fiat%3Aru%3Asbp&amount=10",
    );
    client.destroy();
  });

  it("always sends an idempotency key on fiat deposit creates and requires one for withdrawals", async () => {
    const api = createFakeFetch(() => undefined);
    const client = createPayClient({ mode: "withdraw", createSession: sessionSpy(), fetch: api.fetch });
    await expect(
      client.createWithdrawal(
        { methodId: "m", address: "a", amount: "1" },
        { idempotencyKey: "" },
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED", details: { field: "Idempotency-Key" } });
    await expect(
      client.createWithdrawal({ methodId: "m", address: "a", amount: "1" }, { idempotencyKey: "bad key" }),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    expect(api.calls("/broker/pay/withdrawals")).toHaveLength(0);

    await client.createDeposit({ methodId: "fiat:ru:sbp", amount: "1000" }).catch(() => undefined);
    expect(api.calls("/broker/pay/deposits")[0]?.headers["idempotency-key"]).toMatch(/^bp_[A-Za-z0-9_-]{8,}$/);
    client.destroy();
  });

  it("maps INTERNAL_ERROR and bare 5xx answers", async () => {
    const api = createFakeFetch((request) => {
      if (request.path === "/broker/pay/context") return payError(500, "INTERNAL_ERROR");
      if (request.path === "/broker/pay/methods") return json(500, { error: { message: "boom" } });
      if (request.path === "/broker/pay/activity") return json(503, null);
      return undefined;
    });
    const client = createPayClient({ mode: "deposit", createSession: sessionSpy(), fetch: api.fetch });
    await expect(client.getContext()).rejects.toMatchObject({ code: "INTERNAL_ERROR", status: 500 });
    await expect(client.listMethods()).rejects.toMatchObject({ code: "INTERNAL_ERROR" });
    await expect(client.getActivity(0)).rejects.toMatchObject({ code: "PROVIDER_UNAVAILABLE" });
    client.destroy();
  });

  it("tolerates the nullable fields the backend sends", async () => {
    const api = createFakeFetch((request) => {
      if (request.path === "/broker/pay/context") {
        return json(200, {
          ...CONTEXT,
          balance: { available: null, held: null, total: null, withdrawable: null, currency: "USD" },
          branding: null,
        });
      }
      if (request.path === "/broker/pay/withdrawals/wd_1") {
        return json(200, withdrawal({ amount_usd: null, chain_id: null, currency: null, address: null, fee_usd: null }));
      }
      if (request.path === "/broker/pay/activity") {
        return json(200, {
          server_time: 1,
          deposits: [{ payment_id: 7, amount_usd: null, source: "card", credited_at: 2 }],
          withdrawals: [{ payment_id: 8, id: "wd_1", status: "refund_pending", updated_at: 3 }],
        });
      }
      if (request.path === "/broker/pay/deposits/dep_crypto_1") {
        return json(200, { id: "dep_crypto_1", kind: "crypto", chain_id: "bsc", currency: "USDT", address: "0xabc", status: "consumed", expires_at: null, created_at: null });
      }
      if (request.path === "/broker/pay/deposits/dep_ru_1") {
        return json(200, {
          id: "dep_ru_1", kind: "fiat", rail: "ru", method_id: "fiat:ru:sbp", status: "pending", amount: null, currency: "RUB",
          estimated_usd: null, credited_usd: null, expires_at: null, server_time: 1,
          next_action: { type: "qr", payload: null, image_url: "https://qr.example/1.png" },
          receipt: { required: false, attached_at: null }, created_at: null, updated_at: null,
        });
      }
      return undefined;
    });
    const client = createPayClient({ mode: "withdraw", createSession: sessionSpy(), fetch: api.fetch });
    const context = await client.getContext();
    expect(context.balance.available).toBeNull();
    expect(context.branding).toEqual({ theme: null, accentColor: null, backgroundColor: null, logoUrl: null });
    const result = await client.getWithdrawal("wd_1");
    expect(result).toMatchObject({ paymentId: 222334, amountUsd: null, chainId: null, address: null });
    const activity = await client.getActivity(0);
    expect(activity.deposits).toEqual([{ paymentId: 7, amountUsd: null, source: "card", creditedAt: 2 }]);
    expect(activity.withdrawals[0]?.status).toBe("refund_pending");
    expect(await client.getDeposit("dep_crypto_1")).toMatchObject({ status: "consumed", createdAt: 0 });
    expect(await client.getDeposit("dep_ru_1")).toMatchObject({
      amount: null,
      nextAction: { type: "qr", payload: null, imageUrl: "https://qr.example/1.png" },
    });
    client.destroy();
  });

  it("reads the frame ticket and the frame next_action", async () => {
    const api = createFakeFetch((request) => {
      if (request.path === "/broker/pay/deposits/dep_ru_1/frame-ticket") return json(200, frameTicket());
      if (request.path === "/broker/pay/deposits/dep_in_1/frame-ticket") return json(200, frameTicket({ ticket: "tkt_bad" }));
      if (request.path === "/broker/pay/deposits/dep_ru_1") {
        return json(200, fiatDeposit({ next_action: { type: "show_requisites", requisites: null, frame: { origins: ["https://binodex.test"], path: "/embed/pay/requisites" } } }));
      }
      return undefined;
    });
    const client = createPayClient({ mode: "deposit", createSession: sessionSpy(), fetch: api.fetch });
    await expect(client.getRequisitesFrameTicket("dep_ru_1")).resolves.toMatchObject({
      ticket: expect.stringMatching(/^wft_/),
      expiresIn: 60,
      frameOrigins: ["https://binodex.test", "https://binodex-ru.test"],
      framePath: "/embed/pay/requisites",
    });
    await expect(client.getRequisitesFrameTicket("dep_in_1")).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
    expect(await client.getDeposit("dep_ru_1")).toMatchObject({
      nextAction: { type: "show_requisites", requisites: null, frame: { origins: ["https://binodex.test"], path: "/embed/pay/requisites" } },
    });
    expect(client.frameOrigins(["https://binodex-ru.test", "https://binodex.test", "https://evil.test"])).toEqual([
      "https://binodex.test",
      "https://binodex-ru.test",
    ]);
    client.destroy();
  });

  it("never exposes a review status for withdrawals", async () => {
    const api = createFakeFetch((request) =>
      request.path === "/broker/pay/withdrawals/wd_1"
        ? json(200, withdrawal({ status: "review", display_status: "review" }))
        : undefined,
    );
    const client = createPayClient({ mode: "withdraw", createSession: sessionSpy(), fetch: api.fetch });
    const result = await client.getWithdrawal("wd_1");
    expect(result.status).toBe("pending");
    expect(result.displayStatus).toBe("pending");
    client.destroy();
  });

  it("drops unknown method kinds and never copies unknown fields", async () => {
    const api = createFakeFetch((request) =>
      request.path === "/broker/pay/methods"
        ? json(200, {
            mode: "deposit",
            methods: [
              { id: "x", kind: "wallet_connect" },
              { id: "fiat:ru:sbp", kind: "fiat", rail: "ru", currency: "RUB", provider: "secret" },
            ],
            ordering: {},
            unavailable_rails: [],
          })
        : undefined,
    );
    const client = createPayClient({ mode: "deposit", createSession: sessionSpy(), fetch: api.fetch });
    const methods = await client.listMethods();
    expect(methods.methods).toHaveLength(1);
    expect(JSON.stringify(methods)).not.toContain("secret");
    client.destroy();
  });

  it("rejects receipts above the size cap without calling the API", async () => {
    const api = createFakeFetch(() => undefined);
    const client = createPayClient({ mode: "deposit", createSession: sessionSpy(), fetch: api.fetch });
    const big = new Blob([new Uint8Array(12 * 1024 * 1024)]);
    await expect(client.attachReceipt("dep_ru_1", big)).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
      details: { field: "file" },
    });
    expect(api.requests).toHaveLength(0);
    client.destroy();
  });

  it("uploads a receipt as a data URL", async () => {
    const api = createFakeFetch((request) =>
      request.path === "/broker/pay/deposits/dep_ru_1/receipt"
        ? json(200, {
            id: "dep_ru_1",
            kind: "fiat",
            rail: "ru",
            method_id: "fiat:ru:sbp",
            status: "pending",
            amount: "5000",
            currency: "RUB",
            receipt: { required: true, attached_at: 1 },
          })
        : undefined,
    );
    const client = createPayClient({ mode: "deposit", createSession: sessionSpy(), fetch: api.fetch });
    const deposit = await client.attachReceipt("dep_ru_1", new Blob(["hello"], { type: "image/png" }));
    expect(deposit.receipt.attachedAt).toBe(1);
    expect(
      (api.calls("/broker/pay/deposits/dep_ru_1/receipt")[0]?.body as { file_base64: string }).file_base64,
    ).toMatch(/^data:image\/png;base64,/);
    client.destroy();
  });
});

describe("review fixes", () => {
  it("never puts the token into thrown errors or console output", async () => {
    const logs: unknown[] = [];
    for (const method of ["log", "info", "warn", "error", "debug"] as const) {
      vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
        logs.push(args);
      });
    }
    const api = createFakeFetch((request) => {
      if (request.path === "/broker/pay/context") return payError(401, "UNAUTHENTICATED");
      if (request.path === "/broker/pay/methods") return payError(400, "VALIDATION_FAILED", { field: "x" });
      if (request.path === "/broker/pay/activity") return "network-error";
      return undefined;
    });
    const client = createPayClient({ mode: "deposit", createSession: sessionSpy(), fetch: api.fetch });
    const errors = await Promise.all([
      client.getContext().catch((error: unknown) => error),
      client.listMethods().catch((error: unknown) => error),
      client.getActivity(0).catch((error: unknown) => error),
    ]);
    for (const error of errors) {
      const text = `${String(error)} ${(error as Error).stack ?? ""} ${JSON.stringify(error)} ${JSON.stringify(Object.entries(error as object))}`;
      expect(text).not.toMatch(TOKEN_PATTERN);
    }
    expect(JSON.stringify(logs)).not.toMatch(TOKEN_PATTERN);
    expect(api.requests.some((entry) => TOKEN_PATTERN.test(entry.headers.authorization ?? ""))).toBe(true);
    client.destroy();
  });

  it("turns PAY_API_DISABLED from any pay call into a session failure", async () => {
    let disabled = false;
    const api = createFakeFetch((request) => {
      if (disabled && request.path.startsWith("/broker/pay/")) return payError(404, "PAY_API_DISABLED");
      if (request.path === "/broker/pay/context") return json(200, CONTEXT);
      return undefined;
    });
    const client = createPayClient({ mode: "deposit", createSession: sessionSpy(), fetch: api.fetch });
    await client.getContext();
    disabled = true;
    await expect(client.getOnrampSession({})).rejects.toMatchObject({ code: "PAY_API_DISABLED" });
    expect(client.state.getSnapshot()).toMatchObject({ status: "error", error: { code: "PAY_API_DISABLED" } });
    const before = api.requests.length;
    await expect(client.getContext()).rejects.toMatchObject({ code: "PAY_API_DISABLED" });
    expect(api.requests.length).toBe(before);
    client.destroy();
  });

  it("rejects non-https redirect URLs and QR images in next_action", async () => {
    const api = createFakeFetch((request) => {
      if (request.path === "/broker/pay/deposits/dep_ua_1") {
        return json(200, fiatDeposit({ id: "dep_ua_1", rail: "ua", next_action: { type: "redirect", url: "http://pay.example/x" } }));
      }
      if (request.path === "/broker/pay/deposits/dep_kz_1") {
        return json(200, fiatDeposit({ id: "dep_kz_1", rail: "kz", next_action: { type: "qr", payload: null, image_url: "http://qr.example/1.png" } }));
      }
      if (request.path === "/broker/pay/deposits/dep_kz_2") {
        return json(200, fiatDeposit({ id: "dep_kz_2", rail: "kz", next_action: { type: "redirect", url: "javascript:alert(1)" } }));
      }
      return undefined;
    });
    const client = createPayClient({ mode: "deposit", createSession: sessionSpy(), fetch: api.fetch });
    expect((await client.getDeposit("dep_ua_1")) as { nextAction: unknown }).toMatchObject({ nextAction: null });
    expect((await client.getDeposit("dep_kz_1")) as { nextAction: unknown }).toMatchObject({ nextAction: null });
    expect((await client.getDeposit("dep_kz_2")) as { nextAction: unknown }).toMatchObject({ nextAction: null });
    client.destroy();
  });

  it("races both hosts when geo is unknown even if the legacy region says global", async () => {
    vi.useFakeTimers();
    const api = createFakeFetch((request) => {
      if (request.path === "/broker/pay/ping") {
        return new Promise<Response>((resolve) =>
          setTimeout(() => resolve(json(200, { ok: true, server_time: 1 })), request.base === API_A ? 900 : 100),
        );
      }
      if (request.path === "/broker/pay/context") return json(200, CONTEXT);
      return undefined;
    });
    const client = createPayClient({
      mode: "deposit",
      createSession: sessionSpy({ region: "global", geo: "unknown" }),
      fetch: api.fetch,
    });
    const pending = client.getContext();
    await vi.advanceTimersByTimeAsync(0);
    expect(api.calls("/broker/pay/ping")).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(150);
    await pending;
    expect(api.calls("/broker/pay/context")[0]?.base).toBe(API_B);
    client.destroy();
  });

  it("probes sequentially when geo is known and falls back to region without geo", async () => {
    vi.useFakeTimers();
    const run = async (overrides: Record<string, unknown>) => {
      const api = createFakeFetch((request) =>
        request.path === "/broker/pay/context" ? json(200, CONTEXT) : undefined,
      );
      const client = createPayClient({ mode: "deposit", createSession: sessionSpy(overrides), fetch: api.fetch });
      await client.getContext();
      client.destroy();
      return api.calls("/broker/pay/ping").length;
    };
    expect(await run({ region: "unknown", geo: "global" })).toBe(1);
    expect(await run({ region: "global", geo: undefined })).toBe(1);
    expect(await run({ region: "unknown", geo: undefined })).toBe(2);
  });

  it("a late failover never overrides a newer host choice", async () => {
    vi.useFakeTimers();
    const API_C = "https://api.binodex-mirror.test/v1";
    let session = 0;
    const createSession = vi.fn(async () => {
      session += 1;
      return (session === 1
        ? sessionSpy()
        : sessionSpy({ api_base: API_C, api_bases: [API_C], widget_origins: ["https://binodex-mirror.test"] }))({
        mode: "deposit",
        signal: new AbortController().signal,
      });
    });
    let aDown = false;
    let rejectToken1 = false;
    const api = createFakeFetch((request) => {
      if (request.base === API_A && aDown) return "network-error";
      if (request.base === API_B && request.path === "/broker/pay/ping") {
        return new Promise<Response>((resolve) =>
          setTimeout(() => resolve(json(200, { ok: true, server_time: 1 })), 2000),
        );
      }
      if (request.path === "/broker/pay/context") {
        if (rejectToken1 && request.headers.authorization?.includes("token-1-")) return payError(401, "UNAUTHENTICATED");
        return json(200, CONTEXT);
      }
      return undefined;
    });
    const client = createPayClient({ mode: "deposit", createSession: createSession as never, fetch: api.fetch });
    await client.getContext();
    aDown = true;
    const failing = client.getContext().catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(100);
    aDown = false;
    rejectToken1 = true;
    const renewed = client.getContext();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(0);
    await renewed;
    await vi.advanceTimersByTimeAsync(2500);
    await failing;
    await client.getContext();
    expect(api.calls("/broker/pay/context").at(-1)?.base).toBe(API_C);
    client.destroy();
  });
});
