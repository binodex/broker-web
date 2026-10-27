import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  WITHDRAW_CONTEXT,
  WITHDRAW_METHODS,
  createFakeFetch,
  json,
  payError,
  sessionSpy,
  withdrawal,
  type FakeReply,
  type FakeRequest,
} from "../../../test/pay-api.js";
import { createPayClient } from "../client.js";
import type { PayEvent } from "../events.js";
import { createWithdrawFlow } from "./withdraw.js";

const ADDRESS = "0x52908400098527886E0F7030069857D2E4169EE7";
const QUOTE = {
  quote: { fee_usd: "0.45", receive_amount: "99.55", receive_amount_usd: "99.55", eta_seconds: 90, slippage_pct: "0.3" },
  slippage_warning: null,
};

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

const setup = (
  extra: (request: FakeRequest) => FakeReply | undefined = () => undefined,
  context: Record<string, unknown> = WITHDRAW_CONTEXT,
) => {
  const api = createFakeFetch((request) => {
    const custom = extra(request);
    if (custom !== undefined) return custom;
    switch (`${request.method} ${request.path}`) {
      case "GET /broker/pay/context":
        return json(200, context);
      case "GET /broker/pay/methods":
        return json(200, WITHDRAW_METHODS);
      case "POST /broker/pay/withdrawals/quote":
        return json(200, QUOTE);
      case "POST /broker/pay/withdrawals":
        return json(201, withdrawal());
      default:
        return undefined;
    }
  });
  const events: PayEvent[] = [];
  const client = createPayClient({
    mode: "withdraw",
    createSession: sessionSpy(),
    fetch: api.fetch,
    onEvent: (event) => events.push(event),
  });
  const flow = createWithdrawFlow(client);
  return { api, client, flow, events };
};

const fill = async (flow: ReturnType<typeof createWithdrawFlow>, amount = "100") => {
  flow.actions.start();
  await vi.advanceTimersByTimeAsync(0);
  flow.actions.setAddress(ADDRESS);
  flow.actions.setAmount(amount);
  await vi.advanceTimersByTimeAsync(400);
};

describe("withdraw flow", () => {
  it("validates locally, quotes once after 400 ms of quiet and submits with a key", async () => {
    const { api, flow, client, events } = setup();
    flow.actions.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(flow.getSnapshot().method?.id).toBe("crypto:bsc:usdc");
    flow.actions.setAddress("0x123");
    expect(flow.getSnapshot().addressError?.code).toBe("INVALID_ADDRESS");
    flow.actions.setAddress(ADDRESS);
    flow.actions.setAmount("5");
    expect(flow.getSnapshot().amountError?.code).toBe("AMOUNT_TOO_SMALL");
    flow.actions.setAmount("500");
    expect(flow.getSnapshot().amountError?.code).toBe("INSUFFICIENT_BALANCE");
    flow.actions.setAmount("10");
    flow.actions.setAmount("100");
    await vi.advanceTimersByTimeAsync(399);
    expect(api.calls("/broker/pay/withdrawals/quote")).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(api.calls("/broker/pay/withdrawals/quote")).toHaveLength(1);
    expect(api.calls("/broker/pay/withdrawals/quote")[0]?.body).toEqual({
      method_id: "crypto:bsc:usdc",
      address: ADDRESS,
      amount: "100",
    });
    expect(flow.getSnapshot().quote?.receiveAmount).toBe("99.55");

    await flow.actions.submit();
    const create = api.calls("/broker/pay/withdrawals", "POST")[0];
    expect(create?.headers["idempotency-key"]).toMatch(/^bp_/);
    expect(create?.body).toMatchObject({ method_id: "crypto:bsc:usdc", amount: "100", quote: { fee_usd: "0.45" } });
    expect(flow.getSnapshot().step).toBe("status");
    expect(events.map((event) => event.type)).toContain("withdrawal.created");
    flow.actions.destroy();
    client.destroy();
  });

  it("sets the max to the withdrawable amount, not the available one", async () => {
    const { flow, client } = setup();
    flow.actions.start();
    await vi.advanceTimersByTimeAsync(0);
    flow.actions.setMax();
    expect(flow.getSnapshot().amount).toBe("120.00");
    flow.actions.destroy();
    client.destroy();
  });

  it("asks to confirm high slippage and re-quotes with +0.01 pp", async () => {
    let accepted: number | undefined;
    const { api, flow, client } = setup((request) => {
      if (request.path !== "/broker/pay/withdrawals/quote") return undefined;
      accepted = (request.body as { accept_slippage_pct?: number }).accept_slippage_pct;
      return accepted === undefined
        ? json(200, {
            quote: null,
            slippage_warning: { slippage_pct: "17.55", max_allowed_pct: "7", receive_amount: "82.45", receive_amount_usd: "82.45" },
          })
        : json(200, QUOTE);
    });
    await fill(flow);
    expect(flow.getSnapshot().step).toBe("slippage-confirm");
    flow.actions.acceptSlippage();
    await vi.advanceTimersByTimeAsync(0);
    expect(accepted).toBe(17.56);
    expect(flow.getSnapshot().step).toBe("form");
    await flow.actions.submit();
    expect(api.calls("/broker/pay/withdrawals", "POST")[0]?.body).toMatchObject({ accept_slippage_pct: 17.56 });

    flow.actions.reset();
    expect(flow.getSnapshot().acceptedSlippagePct).toBeNull();
    flow.actions.destroy();
    client.destroy();
  });

  it("collects a 2FA code when the server asks for it and rotates the key with the code", async () => {
    const { api, flow, client } = setup((request) => {
      if (request.method !== "POST" || request.path !== "/broker/pay/withdrawals") return undefined;
      const code = (request.body as { two_factor_code?: string }).two_factor_code;
      if (!code) return payError(400, "TWO_FA_REQUIRED");
      if (code !== "123456") return payError(400, "TWO_FA_INVALID");
      return json(201, withdrawal());
    });
    await fill(flow);
    await flow.actions.submit();
    expect(flow.getSnapshot().step).toBe("two-factor");
    expect(flow.getSnapshot().submitError).toBeNull();
    flow.actions.setTwoFactorCode("11a1111");
    expect(flow.getSnapshot().twoFactorCode).toBe("111111");
    await flow.actions.submit();
    expect(flow.getSnapshot().submitError?.code).toBe("TWO_FA_INVALID");
    expect(flow.getSnapshot().step).toBe("two-factor");
    flow.actions.setTwoFactorCode("123456");
    await flow.actions.submit();
    expect(flow.getSnapshot().step).toBe("status");
    const keys = api.calls("/broker/pay/withdrawals", "POST").map((entry) => entry.headers["idempotency-key"]);
    expect(new Set(keys).size).toBe(3);
    flow.actions.destroy();
    client.destroy();
  });

  it("asks for 2FA before submitting when the context says it is required", async () => {
    const { api, flow, client } = setup(undefined, {
      ...WITHDRAW_CONTEXT,
      withdrawal: { two_factor_required: true, in_flight_id: null },
    });
    await fill(flow);
    await flow.actions.submit();
    expect(flow.getSnapshot().step).toBe("two-factor");
    expect(api.calls("/broker/pay/withdrawals", "POST")).toHaveLength(0);
    flow.actions.destroy();
    client.destroy();
  });

  it("resumes the user's own in-flight withdrawal on WITHDRAWAL_IN_PROGRESS", async () => {
    const { api, flow, client } = setup((request) => {
      if (request.method === "POST" && request.path === "/broker/pay/withdrawals") {
        return payError(409, "WITHDRAWAL_IN_PROGRESS", { withdrawal_id: "wd_9" });
      }
      if (request.path === "/broker/pay/withdrawals/wd_9") return json(200, withdrawal({ id: "wd_9" }));
      return undefined;
    });
    await fill(flow);
    await flow.actions.submit();
    await vi.advanceTimersByTimeAsync(0);
    expect(flow.getSnapshot().step).toBe("status");
    expect(flow.getSnapshot().withdrawal?.id).toBe("wd_9");
    expect(api.calls("/broker/pay/withdrawals/wd_9")).toHaveLength(1);
    flow.actions.destroy();
    client.destroy();
  });

  it("resumes an in-flight withdrawal named by the context", async () => {
    const { flow, client } = setup(
      (request) =>
        request.path === "/broker/pay/withdrawals/wd_7" ? json(200, withdrawal({ id: "wd_7" })) : undefined,
      { ...WITHDRAW_CONTEXT, withdrawal: { two_factor_required: false, in_flight_id: "wd_7" } },
    );
    flow.actions.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(flow.getSnapshot().step).toBe("status");
    expect(flow.getSnapshot().withdrawal?.id).toBe("wd_7");
    flow.actions.destroy();
    client.destroy();
  });

  it("shows the submitted quote until the rail reports its own figures, for that withdrawal only", async () => {
    let polls = 0;
    const pending = { receive_amount: null, receive_amount_usd: null, eta_seconds: null, fee_usd: null };
    const { flow, client } = setup((request) => {
      if (request.method === "POST" && request.path === "/broker/pay/withdrawals") return json(201, withdrawal(pending));
      if (request.path !== "/broker/pay/withdrawals/wd_1") return undefined;
      polls += 1;
      return json(200, withdrawal(polls === 1 ? pending : { receive_amount: "98.10", receive_amount_usd: "98.10" }));
    });
    await fill(flow);
    await flow.actions.submit();
    expect(flow.getSnapshot().withdrawal).toMatchObject({ receiveAmount: "99.55", receiveAmountUsd: "99.55", etaSeconds: 90, feeUsd: null });
    await vi.advanceTimersByTimeAsync(4000);
    expect(flow.getSnapshot().withdrawal).toMatchObject({ receiveAmount: "99.55" });
    await vi.advanceTimersByTimeAsync(8000);
    expect(flow.getSnapshot().withdrawal).toMatchObject({ receiveAmount: "98.10", receiveAmountUsd: "98.10" });
    flow.actions.destroy();
    client.destroy();
  });

  it("never lends the current quote to another in-flight withdrawal", async () => {
    const { flow, client } = setup((request) => {
      if (request.method === "POST" && request.path === "/broker/pay/withdrawals") {
        return payError(409, "WITHDRAWAL_IN_PROGRESS", { withdrawal_id: "wd_other" });
      }
      if (request.path === "/broker/pay/withdrawals/wd_other") {
        return json(200, withdrawal({ id: "wd_other", receive_amount: null, receive_amount_usd: null }));
      }
      return undefined;
    });
    await fill(flow);
    await flow.actions.submit();
    await vi.advanceTimersByTimeAsync(0);
    expect(flow.getSnapshot().withdrawal).toMatchObject({ id: "wd_other", receiveAmount: null });
    flow.actions.destroy();
    client.destroy();
  });

  it("polls status 4 s with backoff to 30 s and stops on a terminal status", async () => {
    let calls = 0;
    const { api, flow, client, events } = setup((request) => {
      if (request.path !== "/broker/pay/withdrawals/wd_1") return undefined;
      calls += 1;
      if (calls <= 2) return "network-error";
      if (calls === 3) return json(200, withdrawal({ display_status: "success", status: "processing" }));
      return json(200, withdrawal({ status: "completed", display_status: "success", destination_tx_hash: "0xabc" }));
    });
    await fill(flow);
    await flow.actions.submit();
    await vi.advanceTimersByTimeAsync(4000);
    expect(api.calls("/broker/pay/withdrawals/wd_1").length).toBeGreaterThanOrEqual(1);
    await vi.advanceTimersByTimeAsync(8000 + 16000);
    await vi.advanceTimersByTimeAsync(4000);
    expect(flow.getSnapshot().withdrawal?.status).toBe("completed");
    const statusEvents = events.filter((event) => event.type === "withdrawal.status");
    expect(statusEvents.map((event) => (event as { displayStatus: string }).displayStatus)).toEqual([
      "pending",
      "success",
      "success",
    ]);
    const total = api.calls("/broker/pay/withdrawals/wd_1").length;
    await vi.advanceTimersByTimeAsync(120_000);
    expect(api.calls("/broker/pay/withdrawals/wd_1").length).toBe(total);
    flow.actions.destroy();
    client.destroy();
  });
});
