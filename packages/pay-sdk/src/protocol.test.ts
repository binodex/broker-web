import { describe, expect, it } from "vitest";
import { initMessage, readWidgetMessage } from "./protocol.js";

const CHANNEL = "Zk3_q-".repeat(4);

class Ready {
  type = "binodex-embed:ready";
}

describe("readWidgetMessage", () => {
  it.each([
    [{ type: "binodex-embed:ready" }, { type: "ready" }],
    [{ type: "binodex-embed:reauth-required" }, { type: "reauth-required" }],
    [{ type: "binodex-embed:close" }, { type: "close" }],
    [
      { type: "binodex-embed:resize", height: 640 },
      { type: "resize", height: 640 },
    ],
    [
      { type: "binodex-embed:credited", amount: 25, asset: "USDT" },
      { type: "credited", amount: 25, asset: "USDT" },
    ],
    [
      { type: "binodex-embed:error", message: "widget_auth_error" },
      { type: "error", reason: "widget_auth_error" },
    ],
  ])("maps %j", (data, event) => {
    expect(readWidgetMessage(data)).toEqual({ event, channel: null });
    expect(readWidgetMessage({ ...data, channel: CHANNEL })).toEqual({
      event,
      channel: CHANNEL,
    });
  });

  it("never forwards free text from the widget as an error reason", () => {
    expect(
      readWidgetMessage({
        type: "binodex-embed:error",
        message: "<b>card 4111</b>",
      }),
    ).toEqual({ event: { type: "error", reason: "unknown" }, channel: null });
  });

  it.each([
    null,
    "binodex-embed:ready",
    JSON.stringify({ type: "binodex-embed:ready" }),
    [],
    new Ready(),
    { type: "binodex-embed:init", session: "wss_x" },
    { type: "other:ready" },
    { type: "binodex-embed:ready", channel: 42 },
    { type: "binodex-embed:resize", height: "640" },
    { type: "binodex-embed:resize", height: -1 },
    { type: "binodex-embed:resize", height: Number.POSITIVE_INFINITY },
    { type: "binodex-embed:credited", amount: 0, asset: "USDT" },
    { type: "binodex-embed:credited", amount: 10, asset: "usdt<script>" },
  ])("drops %j", (data) => {
    expect(readWidgetMessage(data)).toBeNull();
  });
});

describe("initMessage", () => {
  it("keeps the legacy shape byte for byte without a channel", () => {
    expect(initMessage("wss_x", null)).toStrictEqual({
      type: "binodex-embed:init",
      session: "wss_x",
    });
  });

  it("adds the channel for frames that proved it", () => {
    expect(initMessage("wss_x", CHANNEL)).toStrictEqual({
      type: "binodex-embed:init",
      session: "wss_x",
      channel: CHANNEL,
    });
  });
});
