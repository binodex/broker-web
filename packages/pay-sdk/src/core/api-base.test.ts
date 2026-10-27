import { afterEach, describe, expect, it, vi } from "vitest";
import { API_A, API_B, createFakeFetch, json, payError } from "../../test/pay-api.js";
import { resolveWidgetLocation } from "../widget-url.js";
import { orderFrameOrigins, resolveHosts, selectApiBase, validateApiBase } from "./api-base.js";

afterEach(() => {
  vi.useRealTimers();
});

describe("validateApiBase", () => {
  it.each([
    ["https://api.binodex.app/v1", "https://api.binodex.app/v1"],
    ["https://api.binodex.app/v1/", "https://api.binodex.app/v1"],
    ["https://api.binodex.app:8443/v1", "https://api.binodex.app:8443/v1"],
    ["http://localhost:3000/v1", "http://localhost:3000/v1"],
    ["http://127.0.0.1:3000/v1", "http://127.0.0.1:3000/v1"],
    ["http://[::1]:3000/v1", "http://[::1]:3000/v1"],
    ["http://api.binodex.localhost/v1", "http://api.binodex.localhost/v1"],
  ])("accepts %s", (input, expected) => {
    expect(validateApiBase(input)).toBe(expected);
  });

  it.each([
    "http://api.binodex.app/v1",
    "https://user:pass@api.binodex.app/v1",
    "https://api.binodex.app",
    "https://api.binodex.app/",
    "https://api.binodex.app/v2",
    "https://api.binodex.app/v1/broker",
    "https://api.binodex.app/v1?x=1",
    "https://api.binodex.app/v1#frag",
    "javascript:alert(1)",
    "ftp://api.binodex.app/v1",
    "/v1",
    "",
    null,
    42,
  ])("rejects %s", (input) => {
    expect(validateApiBase(input)).toBeNull();
  });

  it("enforces allowedApiOrigins and normalizes entries to origins", () => {
    expect(validateApiBase(API_A, ["https://api.binodex.test/anything"])).toBe(API_A);
    expect(validateApiBase(API_B, ["https://api.binodex.test"])).toBeNull();
    expect(validateApiBase(API_A, [])).toBeNull();
    expect(validateApiBase(API_A, ["http://api.binodex.test"])).toBeNull();
  });

  it("agrees with the widget-url transport rules", () => {
    const hosts = [
      "https://pay.example",
      "http://localhost:5173",
      "http://pay.example",
      "https://u:p@pay.example",
    ];
    for (const host of hosts) {
      const widget = resolveWidgetLocation({
        session: { session: "wss_x", widget_url: `${host}/embed/pay` },
        mode: "deposit",
        channel: "c",
      });
      expect(validateApiBase(`${host}/v1`) !== null).toBe(widget !== null);
    }
  });
});

describe("resolveHosts", () => {
  it("keeps the declared order, drops invalid and duplicate entries", () => {
    expect(
      resolveHosts({
        apiBases: [API_B, "http://evil.example/v1", API_A, `${API_B}/`],
        widgetOrigins: ["https://binodex-ru.test/x", "https://binodex.test"],
      }),
    ).toEqual({
      apiBases: [API_B, API_A],
      widgetOrigins: ["https://binodex-ru.test", "https://binodex.test"],
      widgetOriginByBase: { [API_B]: "https://binodex-ru.test" },
    });
  });

  it("keeps api and widget hosts paired by index even when one widget origin is refused", () => {
    const hosts = resolveHosts({
      apiBases: [API_B, API_A],
      widgetOrigins: ["https://binodex-ru.test", "https://binodex.test"],
      allowedWidgetOrigins: ["https://binodex.test"],
    });
    expect(hosts.widgetOrigins).toEqual(["https://binodex.test"]);
    expect(hosts.widgetOriginByBase).toEqual({ [API_A]: "https://binodex.test" });
  });

  it("falls back to the widget_url origin and honours allowedWidgetOrigins", () => {
    expect(
      resolveHosts({
        apiBases: [API_A],
        widgetOrigins: [],
        widgetUrl: "https://binodex.test/embed/pay?mode=deposit",
        allowedWidgetOrigins: ["https://binodex.test"],
      }).widgetOrigins,
    ).toEqual(["https://binodex.test"]);
    expect(
      resolveHosts({
        apiBases: [API_A],
        widgetOrigins: ["https://other.test"],
        allowedWidgetOrigins: ["https://binodex.test"],
      }).widgetOrigins,
    ).toEqual([]);
  });
});

describe("orderFrameOrigins", () => {
  it("keeps only session hosts, proven host first", () => {
    expect(
      orderFrameOrigins({
        declared: ["https://binodex.test", "https://binodex-ru.test", "https://evil.test", "http://x.test"],
        proven: ["https://binodex-ru.test", "https://binodex.test"],
      }),
    ).toEqual(["https://binodex-ru.test", "https://binodex.test"]);
  });

  it("falls back to the proven hosts when nothing is declared and to the declared ones without a session list", () => {
    expect(orderFrameOrigins({ declared: [], proven: ["https://binodex.test"] })).toEqual(["https://binodex.test"]);
    expect(orderFrameOrigins({ declared: ["https://binodex.test/x"], proven: [] })).toEqual(["https://binodex.test"]);
    expect(
      orderFrameOrigins({ declared: ["https://binodex.test"], proven: [], allowedWidgetOrigins: ["https://other.test"] }),
    ).toEqual([]);
  });
});

const signal = () => new AbortController().signal;

describe("selectApiBase", () => {
  it("uses the preferred host when it answers the probe", async () => {
    const api = createFakeFetch(() => undefined);
    const selected = await selectApiBase({
      bases: [API_A, API_B],
      region: "global",
      fetch: api.fetch,
      signal: signal(),
    });
    expect(selected.base).toBe(API_A);
    expect(api.requests.map((entry) => entry.base)).toEqual([API_A]);
    expect(api.requests[0]?.path).toBe("/broker/pay/ping");
  });

  it("moves to the next host after a 2500 ms probe timeout", async () => {
    vi.useFakeTimers();
    const api = createFakeFetch((request) =>
      request.base === API_A ? new Promise<Response>(() => undefined) : undefined,
    );
    const pending = selectApiBase({
      bases: [API_A, API_B],
      region: "ru",
      fetch: api.fetch,
      signal: signal(),
    });
    await vi.advanceTimersByTimeAsync(2499);
    expect(api.requests.map((entry) => entry.base)).toEqual([API_A]);
    await vi.advanceTimersByTimeAsync(1);
    await expect(pending).resolves.toMatchObject({ base: API_B });
  });

  it("moves to the next host when the preferred one fails at once", async () => {
    const api = createFakeFetch((request) => (request.base === API_A ? "network-error" : undefined));
    await expect(
      selectApiBase({ bases: [API_A, API_B], region: "global", fetch: api.fetch, signal: signal() }),
    ).resolves.toMatchObject({ base: API_B });
  });

  it("races both hosts when the region is unknown and takes the first answer", async () => {
    vi.useFakeTimers();
    const api = createFakeFetch((request) =>
      request.base === API_A
        ? new Promise<Response>((resolve) =>
            setTimeout(() => resolve(json(200, { ok: true, server_time: 1 })), 800),
          )
        : new Promise<Response>((resolve) =>
            setTimeout(() => resolve(json(200, { ok: true, server_time: 2 })), 200),
          ),
    );
    const pending = selectApiBase({
      bases: [API_A, API_B],
      region: "unknown",
      fetch: api.fetch,
      signal: signal(),
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(api.requests.map((entry) => entry.base).sort()).toEqual([API_B, API_A].sort());
    await vi.advanceTimersByTimeAsync(200);
    await expect(pending).resolves.toEqual({ base: API_B, serverTime: 2 });
    expect(api.mock.mock.calls.find(([url]) => String(url).startsWith("https://api.binodex.test"))?.[1]?.signal?.aborted).toBe(true);
  });

  it("in a race, a failed host does not win over a slow healthy one", async () => {
    vi.useFakeTimers();
    const api = createFakeFetch((request) =>
      request.base === API_B
        ? "network-error"
        : new Promise<Response>((resolve) =>
            setTimeout(() => resolve(json(200, { ok: true, server_time: 1 })), 1500),
          ),
    );
    const pending = selectApiBase({
      bases: [API_A, API_B],
      region: "unknown",
      fetch: api.fetch,
      signal: signal(),
    });
    await vi.advanceTimersByTimeAsync(1500);
    await expect(pending).resolves.toMatchObject({ base: API_A });
  });

  it("reports HOST_UNREACHABLE when nothing answers", async () => {
    vi.useFakeTimers();
    const api = createFakeFetch(() => new Promise<Response>(() => undefined));
    const pending = selectApiBase({
      bases: [API_A, API_B],
      region: "unknown",
      fetch: api.fetch,
      signal: signal(),
    });
    const assertion = expect(pending).rejects.toMatchObject({ code: "HOST_UNREACHABLE" });
    await vi.advanceTimersByTimeAsync(2500);
    await assertion;
  });

  it("reports PAY_API_DISABLED when the flag is off", async () => {
    const api = createFakeFetch(() => payError(404, "PAY_API_DISABLED"));
    await expect(
      selectApiBase({ bases: [API_A, API_B], region: "global", fetch: api.fetch, signal: signal() }),
    ).rejects.toMatchObject({ code: "PAY_API_DISABLED" });
  });

  it("probes without credentials and without caching", async () => {
    const api = createFakeFetch(() => undefined);
    await selectApiBase({ bases: [API_A], region: null, fetch: api.fetch, signal: signal() });
    const init = api.mock.mock.calls[0]?.[1];
    expect(init?.credentials).toBe("omit");
    expect(init?.cache).toBe("no-store");
    expect(new Headers(init?.headers).get("authorization")).toBeNull();
  });
});

describe("validateApiBase edge cases", () => {
  it("normalizes scheme and host case and the default port", () => {
    expect(validateApiBase("HTTPS://API.Binodex.App/v1")).toBe("https://api.binodex.app/v1");
    expect(validateApiBase("https://api.binodex.app:443/v1", ["https://api.binodex.app"])).toBe(
      "https://api.binodex.app/v1",
    );
    expect(validateApiBase("https://api.binodex.app/v1", ["HTTPS://API.BINODEX.APP:443"])).toBe(
      "https://api.binodex.app/v1",
    );
    expect(validateApiBase("https://api.binodex.app:8443/v1", ["https://api.binodex.app"])).toBeNull();
  });

  it("compares IDN hosts in punycode on both sides", () => {
    const base = validateApiBase("https://апи.бинодекс.рф/v1", ["https://апи.бинодекс.рф"]);
    expect(base).toMatch(/^https:\/\/xn--/);
    expect(validateApiBase("https://апи.бинодекс.рф/v1", ["https://api.binodex.app"])).toBeNull();
  });

  it.each([
    "https://api.binodex.app\\@evil.example/v1",
    "https://api.binodex.app//v1",
    "https://api.binodex.app/v1//",
    "https://api.binodex.app/./v1/..",
    "https://evil.example\\.api.binodex.app/v1",
  ])("rejects %s", (input) => {
    expect(validateApiBase(input, ["https://api.binodex.app"])).toBeNull();
  });
});

describe("allowedWidgetOrigins normalization", () => {
  it("matches across port and case differences, not across hosts or ports", () => {
    const resolve = (declared: string, allowed: string) =>
      resolveHosts({ apiBases: [API_A], widgetOrigins: [declared], allowedWidgetOrigins: [allowed] }).widgetOrigins;
    expect(resolve("https://Binodex.TEST:443", "https://binodex.test")).toEqual(["https://binodex.test"]);
    expect(resolve("https://binodex.test", "HTTPS://BINODEX.TEST/")).toEqual(["https://binodex.test"]);
    expect(resolve("https://binodex.test:8443", "https://binodex.test")).toEqual([]);
    expect(resolve("https://pay.binodex.test", "https://binodex.test")).toEqual([]);
  });
});
