import { StrictMode, act, type ReactNode } from "react";
import { createRoot, type Root as ReactRoot } from "react-dom/client";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  API_A,
  CONTEXT,
  DEPOSIT_METHODS,
  WITHDRAW_CONTEXT,
  WIDGET_A,
  WIDGET_B,
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
} from "../../test/pay-api.js";
import type { PayEvent } from "../core/events.js";
import * as Pay from "./index.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ADDRESS = "0x52908400098527886E0F7030069857D2E4169EE7";
const TOKEN_PATTERN = /token-\d+-x{24}/;

let host: HTMLDivElement;
let root: ReactRoot;

const settle = async (ms = 0) => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
};

const render = async (ui: ReactNode) => {
  await act(async () => {
    root.render(ui);
  });
  await settle();
  await settle();
};

const part = (name: string) => host.querySelector<HTMLElement>(`[data-binodex-pay="${name}"]`);
const parts = (name: string) => Array.from(host.querySelectorAll<HTMLElement>(`[data-binodex-pay="${name}"]`));

const click = async (element: Element | null) => {
  if (!element) throw new Error("element not found");
  await act(async () => {
    (element as HTMLElement).click();
  });
  await settle();
};

const methodOption = (query: string) =>
  host.querySelector<HTMLElement>(`[data-binodex-pay="method-option"]${query}`);

const openCardTab = async () => {
  const tab = host.querySelector('[data-binodex-pay="tab"][data-tab="card"]');
  if (tab && tab.getAttribute("aria-pressed") !== "true") await click(tab);
};

const chooseCountry = async (code: string) => {
  await click(host.querySelector('[data-binodex-pay="country-trigger"]'));
  await click(host.querySelector(`[data-binodex-pay="country-option"][data-country="${code}"]`));
};

const RAIL_COUNTRY: Record<string, string> = { ru: "RU", ua: "UA", kz: "KZ", in: "IN" };

const pickFiat = async (methodId: string) => {
  await openCardTab();
  if (!methodOption(`[data-method="${methodId}"]`)) await chooseCountry(RAIL_COUNTRY[methodId.split(":")[1] ?? ""] ?? "");
  await click(methodOption(`[data-method="${methodId}"]`));
};

const pickOnramp = async () => {
  await openCardTab();
  await chooseCountry("US");
};

const pickNetwork = async (chain: string) => {
  await click(host.querySelector('[data-binodex-pay="network-picker"] [data-binodex-pay="route-trigger"]'));
  await click(host.querySelector(`[data-binodex-pay="network-option"][data-chain="${chain}"]`));
};

const type = async (input: HTMLInputElement | null, value: string) => {
  if (!input) throw new Error("input not found");
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
};

const depositApi = (extra: (request: FakeRequest) => FakeReply | undefined = () => undefined) =>
  createFakeFetch((request) => {
    const custom = extra(request);
    if (custom !== undefined) return custom;
    switch (`${request.method} ${request.path}`) {
      case "GET /broker/pay/context":
        return json(200, CONTEXT);
      case "GET /broker/pay/methods":
        return json(200, DEPOSIT_METHODS);
      case "GET /broker/pay/activity":
        return json(200, { server_time: Date.now(), deposits: [], withdrawals: [] });
      case "GET /broker/pay/onramp/session":
        return json(200, { url: "https://buy.onramper.com/?sig=1", single_use: true });
      case "POST /broker/pay/deposits/crypto":
        return json(201, cryptoDeposit());
      case "GET /broker/pay/deposits/dep_crypto_1":
        return json(200, cryptoDeposit());
      case "GET /broker/pay/deposits/quote":
        return json(200, { method_id: "fiat:ru:sbp", amount: "5000", currency: "RUB", estimated_usd: "51.20", displayed_commission_pct: "5" });
      case "POST /broker/pay/deposits":
        return json(201, fiatDeposit());
      case "GET /broker/pay/deposits/dep_ru_1":
        return json(200, fiatDeposit());
      default:
        return undefined;
    }
  });

const withdrawApi = () =>
  createFakeFetch((request) => {
    switch (`${request.method} ${request.path}`) {
      case "GET /broker/pay/context":
        return json(200, WITHDRAW_CONTEXT);
      case "GET /broker/pay/methods":
        return json(200, WITHDRAW_METHODS);
      case "POST /broker/pay/withdrawals/quote":
        return json(200, {
          quote: { fee_usd: "0.45", receive_amount: "99.55", receive_amount_usd: "99.55", eta_seconds: 90, slippage_pct: null },
          slippage_warning: null,
        });
      case "POST /broker/pay/withdrawals":
        return json(201, withdrawal());
      case "GET /broker/pay/withdrawals/wd_1":
        return json(200, withdrawal({ status: "completed", display_status: "success", destination_tx_hash: "0xabcdef0123456789abcdef" }));
      default:
        return undefined;
    }
  });

beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  host.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("Pay.Root + DepositForm", () => {
  it("creates zero deposits under StrictMode and loads the methods once per mount", async () => {
    const api = depositApi();
    await render(
      <StrictMode>
        <Pay.Root mode="deposit" createSession={sessionSpy()} fetch={api.fetch} locale="en">
          <Pay.DepositForm />
        </Pay.Root>
      </StrictMode>,
    );
    await settle(10);
    expect(part("method-picker")).not.toBeNull();
    expect(api.requests.filter((entry) => entry.method === "POST" && entry.path.startsWith("/broker/pay/"))).toHaveLength(0);
    expect(api.calls("/broker/widget-sessions/redeem")).toHaveLength(1);
    expect(api.calls("/broker/pay/methods")).toHaveLength(1);
  });

  it("fetches the single-use onramp URL exactly once under StrictMode", async () => {
    const api = depositApi();
    await render(
      <StrictMode>
        <Pay.Root mode="deposit" createSession={sessionSpy()} fetch={api.fetch} locale="en">
          <Pay.DepositForm />
        </Pay.Root>
      </StrictMode>,
    );
    await settle(10);
    await pickOnramp();
    await settle(10);
    const frame = host.querySelector<HTMLIFrameElement>('iframe[data-binodex-pay="onramp"]');
    expect(frame?.getAttribute("src")).toBe("https://buy.onramper.com/?sig=1");
    expect(api.calls("/broker/pay/onramp/session")).toHaveLength(1);
  });

  it("walks the crypto path: currency, network, address with QR and copy", async () => {
    const api = depositApi();
    const events: PayEvent[] = [];
    await render(
      <Pay.Root mode="deposit" createSession={sessionSpy()} fetch={api.fetch} locale="en" onEvent={(event) => events.push(event)}>
        <Pay.DepositForm />
      </Pay.Root>,
    );
    await click(host.querySelector('[data-binodex-pay="method-option"][data-kind="crypto"]'));
    expect(part("network-picker")).not.toBeNull();
    await pickNetwork("tron");
    await settle(10);
    expect(api.calls("/broker/pay/deposits/crypto")[0]?.body).toEqual({ chain_id: "tron", currency: "USDT" });
    const address = part("address");
    expect(address?.textContent).toBe(ADDRESS);
    expect(address?.hasAttribute("data-hj-suppress")).toBe(true);
    expect(address?.classList.contains("ym-hide-content")).toBe(true);
    expect(part("qr")?.querySelector("path")?.getAttribute("d")).toMatch(/^M\d+ \d+h1v1h-1z/);
    expect(host.querySelector('[data-variant="fee"]')).not.toBeNull();
    expect(events.map((event) => event.type)).toEqual(
      expect.arrayContaining(["session.ready", "method.selected", "deposit.created"]),
    );
    expect(JSON.stringify(events)).not.toMatch(TOKEN_PATTERN);
    expect(host.innerHTML).not.toMatch(TOKEN_PATTERN);
  });

  it("walks the fiat path: amount, quote, raw requisites with copy and receipt upload", async () => {
    const api = depositApi();
    await render(
      <Pay.Root mode="deposit" createSession={sessionSpy()} fetch={api.fetch} locale="en">
        <Pay.DepositForm />
      </Pay.Root>,
    );
    await pickFiat("fiat:ru:sbp");
    const input = host.querySelector<HTMLInputElement>('[data-binodex-pay="amount"] input');
    await type(input, "10");
    expect(part("field-error")?.textContent).toContain("500");
    await type(input, "5000");
    await settle(450);
    expect(part("quote")?.textContent).toContain("$51.20");
    await click(part("submit"));
    await settle(10);
    expect(api.calls("/broker/pay/deposits", "POST")).toHaveLength(1);
    const requisites = part("requisites");
    expect(requisites?.getAttribute("data-delivery")).toBe("raw");
    expect(requisites?.textContent).toContain("2200 0000 0000 0000");
    expect(requisites?.classList.contains("ym-hide-content")).toBe(true);
    expect(part("receipt")).not.toBeNull();
    expect(part("countdown")?.textContent).toMatch(/\d\d:\d\d/);
  });

  it("renders the requisites frame on the proven widget origin in frame mode", async () => {
    const api = depositApi((request) =>
      request.method === "POST" && request.path === "/broker/pay/deposits"
        ? json(201, fiatDeposit({ next_action: { type: "show_requisites", requisites: null, frame: { origins: ["https://binodex-ru.test", "https://binodex.test", "https://evil.test"], path: "//evil.test/x" } } }))
        : undefined,
    );
    await render(
      <Pay.Root mode="deposit" createSession={sessionSpy()} fetch={api.fetch} locale="ru">
        <Pay.DepositForm />
      </Pay.Root>,
    );
    await pickFiat("fiat:ru:sbp");
    await type(host.querySelector<HTMLInputElement>('[data-binodex-pay="amount"] input'), "5000");
    await click(part("submit"));
    await settle(10);
    expect(part("requisites")?.getAttribute("data-delivery")).toBe("frame");
    const frame = host.querySelector<HTMLIFrameElement>('[data-binodex-pay="requisites-frame"] iframe');
    const src = new URL(frame?.getAttribute("src") ?? "");
    expect(src.origin).toBe("https://binodex.test");
    expect(src.pathname).toBe("/embed/pay/requisites");
    expect(src.searchParams.get("deposit")).toBe("dep_ru_1");
    expect(part("receipt")).toBeNull();
    expect(part("status")).toBeNull();
    expect(part("countdown")).toBeNull();
  });

  it.each([
    [{ theme: "dark" } as const, "classic"],
    [{ theme: "dark", skin: "black" } as const, "black"],
  ])("passes the root skin to the requisites frame (%j)", async (appearance, skin) => {
    const frameNext = { type: "show_requisites", requisites: null, frame: { origins: ["https://binodex.test"], path: "/embed/pay/requisites" } };
    const api = depositApi((request) =>
      request.method === "POST" && request.path === "/broker/pay/deposits" ? json(201, fiatDeposit({ next_action: frameNext })) : undefined,
    );
    await render(
      <Pay.Root mode="deposit" createSession={sessionSpy()} fetch={api.fetch} locale="ru" appearance={appearance}>
        <Pay.DepositForm />
      </Pay.Root>,
    );
    await pickFiat("fiat:ru:sbp");
    await type(host.querySelector<HTMLInputElement>('[data-binodex-pay="amount"] input'), "5000");
    await click(part("submit"));
    await settle(10);
    const frame = host.querySelector<HTMLIFrameElement>('[data-binodex-pay="requisites-frame"] iframe');
    expect(part("root")?.getAttribute("data-skin")).toBe(skin);
    expect(new URL(frame?.getAttribute("src") ?? "").searchParams.get("skin")).toBe(skin);
  });

  it("keeps its own status and timer for raw requisites but leaves them to the frame in frame mode", async () => {
    const frameNext = { type: "show_requisites", requisites: null, frame: { origins: ["https://binodex.test"], path: "/embed/pay/requisites" } };
    const api = depositApi((request) => {
      if (request.method === "POST" && request.path === "/broker/pay/deposits") return json(201, fiatDeposit({ next_action: frameNext }));
      if (request.path === "/broker/pay/deposits/dep_ru_1") return json(200, fiatDeposit({ next_action: frameNext }));
      return undefined;
    });
    await render(
      <Pay.Root mode="deposit" createSession={sessionSpy()} fetch={api.fetch} locale="ru" appearance={{ theme: "light" }}>
        <Pay.DepositForm />
        <Pay.Countdown expiresAt={Date.now() + 60_000} data-testid="explicit" />
      </Pay.Root>,
    );
    await pickFiat("fiat:ru:sbp");
    await type(host.querySelector<HTMLInputElement>('[data-binodex-pay="amount"] input'), "5000");
    await click(part("submit"));
    await settle(10);
    expect(part("requisites")?.getAttribute("data-delivery")).toBe("frame");
    expect(part("status")).toBeNull();
    expect(host.querySelectorAll('[data-binodex-pay="countdown"]')).toHaveLength(1);
    expect(host.querySelector('[data-testid="explicit"]')).not.toBeNull();
    const frame = host.querySelector<HTMLIFrameElement>('[data-binodex-pay="requisites-frame"] iframe');
    expect(frame?.style.colorScheme).toBe("light");
    expect(new URL(frame?.getAttribute("src") ?? "").searchParams.get("theme")).toBe("light");
  });

  it("shows rail method labels and numbers in the UI language", async () => {
    const api = depositApi((request) =>
      request.path === "/broker/pay/deposits/quote"
        ? json(200, { method_id: "fiat:ru:sbp", amount: "5000", currency: "RUB", estimated_usd: "51.2", displayed_commission_pct: "0.5" })
        : undefined,
    );
    await render(
      <Pay.Root mode="deposit" createSession={sessionSpy()} fetch={api.fetch} locale="ru">
        <Pay.DepositForm />
      </Pay.Root>,
    );
    await openCardTab();
    await chooseCountry("UA");
    expect(host.querySelector('[data-method="fiat:ua:default"]')?.textContent).toContain("Банковская карта");
    await chooseCountry("RU");
    const sbp = host.querySelector('[data-method="fiat:ru:sbp"]');
    expect(sbp?.querySelector('[data-binodex-pay="option-label"]')?.textContent).toBe("СБП");
    expect(sbp?.querySelector('[data-binodex-pay="option-subtitle"]')?.textContent).toBe("Любой банк");
    await click(sbp);
    expect(part("hint")?.textContent).toBe("От 500 ₽ до 300\u00a0000 ₽");
    await type(host.querySelector<HTMLInputElement>('[data-binodex-pay="amount"] input'), "5000");
    await settle(450);
    const quote = part("quote")?.textContent ?? "";
    expect(quote).toContain("≈ $51.20");
    expect(quote).toContain("0,5%");
  });

  it("outlines only keyboard focus, never the form or status that takes focus after a step change", () => {
    const src = join(dirname(fileURLToPath(import.meta.url)), "..");
    const css = ["ui.css", "elements.css"].map((file) => readFileSync(join(src, file), "utf8")).join("\n");
    expect(css).toContain(':where(.bp-root) :where([tabindex="-1"]:focus) {\n    outline: none;');
    expect(css).toMatch(/:where\(\.bp-root\) :where\(:focus-visible\) \{\n\s+outline: var\(--bp-focus-width\) solid/);
    expect(css).not.toMatch(/:focus\)?\s*\{[^}]*outline:\s*2px/);
  });

  it("renders presets unstyled: no bp- classes but every part keeps its data attribute", async () => {
    const api = depositApi();
    await render(
      <Pay.Root mode="deposit" createSession={sessionSpy()} fetch={api.fetch} locale="en" unstyled>
        <Pay.DepositForm />
      </Pay.Root>,
    );
    expect(host.querySelector('[class*="bp-"]')).toBeNull();
    expect(part("root")).not.toBeNull();
    expect(part("deposit-form")).not.toBeNull();
    expect(part("method-picker")).not.toBeNull();
    const seen = new Set(parts("method-option").map((element) => element.getAttribute("data-method")));
    await openCardTab();
    parts("method-option").forEach((element) => seen.add(element.getAttribute("data-method")));
    await chooseCountry("UA");
    expect(host.querySelector('[data-method="fiat:ua:default"]')?.textContent).toContain("Bank card");
    parts("method-option").forEach((element) => seen.add(element.getAttribute("data-method")));
    await chooseCountry("US");
    await settle(10);
    expect([...seen].sort()).toEqual(["crypto", "fiat:ru:sbp", "fiat:ua:default"]);
    expect(part("onramp")).not.toBeNull();
    expect(part("onramp-note")).not.toBeNull();
    expect(host.querySelector('[class*="bp-"]')).toBeNull();
  });

  it("renders presets with tokens: classes, theme, branding and appearance variables on the root only", async () => {
    const api = depositApi();
    const before = document.documentElement.getAttribute("style");
    await render(
      <Pay.Root
        mode="deposit"
        createSession={sessionSpy()}
        fetch={api.fetch}
        locale="ar"
        className="my-pay"
        appearance={{ theme: "light", variables: { "radius-md": "4px", "color-text": "red;}body{x" } }}
      >
        <Pay.DepositForm />
      </Pay.Root>,
    );
    const rootEl = part("root");
    expect(rootEl?.className).toBe("bp-root my-pay");
    expect(rootEl?.getAttribute("data-theme")).toBe("light");
    expect(rootEl?.getAttribute("dir")).toBe("rtl");
    expect(rootEl?.style.getPropertyValue("--bp-color-accent")).toBe("#00c853");
    expect(rootEl?.style.getPropertyValue("--bp-color-on-accent")).toBe("#ffffff");
    expect(rootEl?.style.getPropertyValue("--bp-radius-md")).toBe("4px");
    expect(rootEl?.style.getPropertyValue("--bp-color-text")).toBe("");
    expect(part("method-picker")?.classList.contains("bp-method-picker")).toBe(true);
    expect(document.documentElement.getAttribute("style")).toBe(before);
  });

  it("lets the preset swap any piece through components", async () => {
    const api = depositApi();
    const MyPicker = () => <div data-testid="custom-picker">custom</div>;
    await render(
      <Pay.Root mode="deposit" createSession={sessionSpy()} fetch={api.fetch} locale="en">
        <Pay.DepositForm components={{ MethodPicker: MyPicker }} />
      </Pay.Root>,
    );
    expect(host.querySelector('[data-testid="custom-picker"]')).not.toBeNull();
    expect(part("method-picker")).toBeNull();
  });

  it("renders nothing interactive on the server and makes no requests", () => {
    const api = depositApi();
    const html = renderToString(
      <Pay.Root mode="deposit" createSession={sessionSpy()} fetch={api.fetch} locale="en">
        <Pay.DepositForm />
      </Pay.Root>,
    );
    expect(html).toContain('data-binodex-pay="root"');
    expect(api.requests).toHaveLength(0);
  });
});

describe("card tab", () => {
  const ruCard = {
    ...DEPOSIT_METHODS.methods.find((method) => method.id === "fiat:ru:sbp"),
    id: "fiat:ru:card",
    method_id: "card",
    label: "Card",
  };
  const withMethods = (methods: unknown[]) =>
    depositApi((request) =>
      request.path === "/broker/pay/methods" ? json(200, { ...DEPOSIT_METHODS, methods }) : undefined,
    );
  const mount = async (api: ReturnType<typeof depositApi>, ui: ReactNode = <Pay.DepositForm />) =>
    render(
      <Pay.Root mode="deposit" createSession={sessionSpy()} fetch={api.fetch} locale="en">
        {ui}
      </Pay.Root>,
    );
  const selectedMethod = () => methodOption("[data-selected]")?.getAttribute("data-method");
  const amountInput = () => host.querySelector<HTMLInputElement>('[data-binodex-pay="amount"] input');

  it("opens with the rail's default method chosen and the amount and button ready", async () => {
    const api = withMethods(
      DEPOSIT_METHODS.methods.flatMap((method) =>
        method.id === "fiat:ru:sbp" ? [method, { ...ruCard, is_default: true }] : [method],
      ),
    );
    const events: PayEvent[] = [];
    await render(
      <Pay.Root mode="deposit" createSession={sessionSpy()} fetch={api.fetch} locale="en" onEvent={(event) => events.push(event)}>
        <Pay.DepositForm />
      </Pay.Root>,
    );
    expect(amountInput()).toBeNull();
    await openCardTab();
    expect(selectedMethod()).toBe("fiat:ru:card");
    expect(amountInput()).not.toBeNull();
    expect(part("submit")).not.toBeNull();
    expect(host.querySelector('[data-binodex-pay="deposit-form"]')?.getAttribute("data-step")).toBe("enter-amount");
    expect(events.filter((event) => event.type === "method.selected")).toEqual([
      expect.objectContaining({ methodId: "fiat:ru:card" }),
    ]);
    expect(api.requests.filter((entry) => entry.method === "POST" && entry.path.startsWith("/broker/pay/"))).toHaveLength(0);
  });

  it("takes the first method of the rail when the backend names no default", async () => {
    await mount(withMethods(DEPOSIT_METHODS.methods.flatMap((method) => (method.id === "fiat:ru:sbp" ? [method, ruCard] : [method]))));
    await openCardTab();
    expect(selectedMethod()).toBe("fiat:ru:sbp");
    expect(amountInput()).not.toBeNull();
  });

  it("follows the country and keeps the user's own pick when they come back", async () => {
    await mount(withMethods(DEPOSIT_METHODS.methods.flatMap((method) => (method.id === "fiat:ru:sbp" ? [method, ruCard] : [method]))));
    await openCardTab();
    await click(methodOption('[data-method="fiat:ru:card"]'));
    expect(selectedMethod()).toBe("fiat:ru:card");
    await chooseCountry("UA");
    expect(selectedMethod()).toBe("fiat:ua:default");
    expect(amountInput()).not.toBeNull();
    await chooseCountry("RU");
    expect(selectedMethod()).toBe("fiat:ru:card");
  });

  it("opens Onramper under the country select for a country without a rail, with a fresh URL each time", async () => {
    let issued = 0;
    const api = depositApi((request) =>
      request.path === "/broker/pay/onramp/session"
        ? json(200, { url: `https://buy.onramper.com/?sig=${(issued += 1)}`, single_use: true })
        : undefined,
    );
    await mount(api);
    await openCardTab();
    await chooseCountry("US");
    await settle(10);
    const frame = () => host.querySelector<HTMLIFrameElement>('iframe[data-binodex-pay="onramp"]');
    expect(frame()?.getAttribute("src")).toBe("https://buy.onramper.com/?sig=1");
    expect(host.querySelector('[data-binodex-pay="tab"][data-tab="card"]')?.getAttribute("aria-pressed")).toBe("true");
    expect(part("country-trigger")).not.toBeNull();
    expect(part("onramp-note")?.textContent).toContain("Onramper");
    expect(part("back")).toBeNull();
    expect(methodOption('[data-kind="onramp"]')).toBeNull();
    await chooseCountry("RU");
    expect(frame()).toBeNull();
    expect(amountInput()).not.toBeNull();
    await chooseCountry("US");
    await settle(10);
    expect(frame()?.getAttribute("src")).toBe("https://buy.onramper.com/?sig=2");
    expect(api.calls("/broker/pay/onramp/session")).toHaveLength(2);
    await click(host.querySelector('[data-binodex-pay="tab"][data-tab="crypto"]'));
    expect(frame()).toBeNull();
  });

  it("stays on the crypto tab untouched and leaves a custom picker to the integrator", async () => {
    await mount(depositApi());
    expect(host.querySelector('[data-binodex-pay="deposit-form"]')?.getAttribute("data-step")).toBe("pick-method");
    await act(async () => root.unmount());
    root = createRoot(host);
    await mount(
      withMethods(DEPOSIT_METHODS.methods.filter((method) => method.kind !== "crypto")),
      <Pay.MethodPicker renderItem={(option, { selected }) => <span data-option={option.id} data-on={selected ? "" : undefined} />} />,
    );
    await settle(10);
    expect(host.querySelector("[data-on]")).toBeNull();
  });
});

describe("fallback", () => {
  it.each([
    ["pay_api is false", { pay_api: false }],
    ["api_base is missing", { api_base: undefined, api_bases: undefined, pay_api: undefined }],
  ])("renders the legacy iframe when %s", async (_, overrides) => {
    const api = depositApi();
    const createSession = sessionSpy(overrides);
    await render(
      <Pay.Root mode="deposit" createSession={createSession} fetch={api.fetch} fallback="iframe" locale="en">
        <Pay.DepositForm />
      </Pay.Root>,
    );
    await settle(10);
    const frame = host.querySelector("iframe");
    expect(part("root")?.getAttribute("data-fallback")).toBe("iframe");
    expect(new URL(frame?.getAttribute("src") ?? "").pathname).toBe("/embed/pay");
    expect(part("deposit-form")).toBeNull();
    expect(api.requests).toHaveLength(0);
    expect(createSession).toHaveBeenCalledTimes(2);
  });

  it("shows the error instead when fallback is not iframe", async () => {
    const api = depositApi();
    await render(
      <Pay.Root mode="deposit" createSession={sessionSpy({ pay_api: false })} fetch={api.fetch} locale="en">
        <Pay.DepositForm />
      </Pay.Root>,
    );
    await settle(10);
    expect(host.querySelector("iframe")).toBeNull();
    expect(part("error")?.getAttribute("data-error")).toBe("PAY_API_UNAVAILABLE");
    expect(part("error")?.textContent).toContain("temporarily unavailable");
  });
});

describe("Pay.Root + WithdrawForm", () => {
  it("quotes, submits and shows the status with a tx link", async () => {
    const api = withdrawApi();
    await render(
      <Pay.Root mode="withdraw" createSession={sessionSpy()} fetch={api.fetch} locale="en">
        <Pay.WithdrawForm />
      </Pay.Root>,
    );
    expect(part("balance")?.textContent).toContain("$120.00");
    await type(host.querySelector<HTMLInputElement>('[data-binodex-pay="address"] input'), ADDRESS);
    await type(host.querySelector<HTMLInputElement>('[data-binodex-pay="amount"] input'), "100");
    await settle(450);
    expect(part("quote")?.textContent).toContain("$0.45");
    await click(part("submit"));
    await settle(10);
    expect(api.calls("/broker/pay/withdrawals", "POST")[0]?.headers["idempotency-key"]).toBeTruthy();
    expect(part("status")?.getAttribute("data-status")).toBe("pending");
    await settle(4100);
    expect(part("status")?.getAttribute("data-status")).toBe("success");
    await click(part("details-toggle"));
    expect(part("tx-link")?.getAttribute("href")).toBe("https://bscscan.com/tx/0xabcdef0123456789abcdef");
  });

  it("uses one-time-code autocomplete for 2FA", async () => {
    const api = createFakeFetch((request) => {
      if (request.path === "/broker/pay/context") {
        return json(200, { ...WITHDRAW_CONTEXT, withdrawal: { two_factor_required: true, in_flight_id: null } });
      }
      if (request.path === "/broker/pay/methods") return json(200, WITHDRAW_METHODS);
      return undefined;
    });
    await render(
      <Pay.Root mode="withdraw" createSession={sessionSpy()} fetch={api.fetch} locale="en">
        <Pay.WithdrawForm />
      </Pay.Root>,
    );
    const input = host.querySelector<HTMLInputElement>('[data-binodex-pay="two-factor"] input');
    expect(input?.getAttribute("autocomplete")).toBe("one-time-code");
    expect(input?.getAttribute("inputmode")).toBe("numeric");
  });
});

describe("hooks and parts", () => {
  it("usePay exposes status, open state and the client", async () => {
    const api = depositApi();
    const seen: string[] = [];
    function Probe() {
      const pay = Pay.usePay();
      seen.push(pay.status);
      return <button type="button" onClick={() => pay.setOpen(false)} data-testid="close" />;
    }
    const onOpenChange = vi.fn();
    await render(
      <Pay.Root mode="deposit" createSession={sessionSpy()} fetch={api.fetch} onOpenChange={onOpenChange}>
        <Probe />
      </Pay.Root>,
    );
    await settle(10);
    expect(seen).toContain("ready");
    await click(host.querySelector('[data-testid="close"]'));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("opens on demand and creates no session while closed", async () => {
    const api = depositApi();
    const createSession = sessionSpy();
    await render(
      <Pay.Root mode="deposit" createSession={createSession} fetch={api.fetch} defaultOpen={false}>
        <Pay.Trigger />
        <Pay.DepositForm />
      </Pay.Root>,
    );
    expect(createSession).not.toHaveBeenCalled();
    expect(part("deposit-form")).toBeNull();
    expect(part("trigger")?.getAttribute("data-state")).toBe("closed");
    await click(part("trigger"));
    await settle(10);
    expect(createSession).toHaveBeenCalledTimes(1);
    expect(part("deposit-form")).not.toBeNull();
  });

  it("usePayEvents receives every event without the token", async () => {
    const api = depositApi();
    const events: PayEvent[] = [];
    function Listener() {
      Pay.usePayEvents((event) => events.push(event));
      return null;
    }
    await render(
      <Pay.Root mode="deposit" createSession={sessionSpy()} fetch={api.fetch}>
        <Listener />
        <Pay.DepositForm />
      </Pay.Root>,
    );
    await pickOnramp();
    expect(events.every((event) => event.source === "client" && typeof event.at === "number")).toBe(true);
    expect(events.map((event) => event.type)).toContain("method.selected");
    expect(JSON.stringify(events)).not.toMatch(TOKEN_PATTERN);
  });

  it("hooks throw outside Pay.Root", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    function Orphan() {
      Pay.usePay();
      return null;
    }
    await expect(
      act(async () => {
        root.render(<Orphan />);
      }),
    ).rejects.toThrow(/inside <Pay.Root>/);
    error.mockRestore();
  });
});

const payErrorReply = () => payError(404, "PAY_API_DISABLED");

describe("review fixes", () => {
  const submitSbp = async () => {
    await pickFiat("fiat:ru:sbp");
    await type(host.querySelector<HTMLInputElement>('[data-binodex-pay="amount"] input'), "5000");
    await click(part("submit"));
    await settle(10);
  };

  it("sends one POST for a double click under StrictMode", async () => {
    const api = depositApi();
    await render(
      <StrictMode>
        <Pay.Root mode="deposit" createSession={sessionSpy()} fetch={api.fetch} locale="en">
          <Pay.DepositForm />
        </Pay.Root>
      </StrictMode>,
    );
    await settle(10);
    await pickFiat("fiat:ru:sbp");
    await type(host.querySelector<HTMLInputElement>('[data-binodex-pay="amount"] input'), "5000");
    const button = part("submit");
    await act(async () => {
      button?.click();
      button?.click();
    });
    await settle(10);
    expect(api.calls("/broker/pay/deposits", "POST")).toHaveLength(1);
  });

  it("does not re-mint the requisites frame when the parent re-renders with inline messages", async () => {
    const api = depositApi((request) => {
      if (request.method === "POST" && request.path === "/broker/pay/deposits") {
        return json(201, fiatDeposit({ next_action: { type: "show_requisites", requisites: null, frame: { origins: ["https://binodex.test"], path: "/embed/pay/requisites" } } }));
      }
      if (request.path === "/broker/pay/deposits/dep_ru_1") {
        return json(200, fiatDeposit({ next_action: { type: "show_requisites", requisites: null, frame: { origins: ["https://binodex.test"], path: "/embed/pay/requisites" } } }));
      }
      return undefined;
    });
    const createSession = sessionSpy();
    const ui = (label: string) => (
      <Pay.Root mode="deposit" createSession={createSession} fetch={api.fetch} locale="en" messages={{ "submit.deposit": label }}>
        <Pay.DepositForm />
      </Pay.Root>
    );
    await render(ui("Pay"));
    await submitSbp();
    const frame = host.querySelector("iframe");
    expect(frame).not.toBeNull();
    await render(ui("Pay"));
    await render(ui("Pay"));
    expect(host.querySelector("iframe")).toBe(frame);
    expect(host.querySelectorAll("iframe")).toHaveLength(1);
  });

  it("shows a frame error with retry and mints a fresh ticket after ticket_expired", async () => {
    const frameNext = { type: "show_requisites", requisites: null, frame: { origins: ["https://binodex.test"], path: "/embed/pay/requisites" } };
    let minted = 0;
    const api = depositApi((request) => {
      if (request.method === "POST" && request.path === "/broker/pay/deposits") return json(201, fiatDeposit({ next_action: frameNext }));
      if (request.path === "/broker/pay/deposits/dep_ru_1") return json(200, fiatDeposit({ next_action: frameNext }));
      if (request.path === "/broker/pay/deposits/dep_ru_1/frame-ticket") {
        minted += 1;
        return json(200, { ticket: `wft_${minted}`, expires_in: 60, expires_at: 1, frame_origins: ["https://binodex.test"], frame_path: "/embed/pay/requisites" });
      }
      return undefined;
    });
    await render(
      <Pay.Root mode="deposit" createSession={sessionSpy()} fetch={api.fetch} locale="en">
        <Pay.DepositForm />
      </Pay.Root>,
    );
    await submitSbp();
    const signal = async (frame: HTMLIFrameElement, data: Record<string, unknown>) => {
      const channel = new URLSearchParams(new URL(frame.getAttribute("src") ?? "").hash.slice(1)).get("channel");
      await act(async () => {
        window.dispatchEvent(new MessageEvent("message", { data: { ...data, channel }, origin: "https://binodex.test", source: frame.contentWindow }));
      });
      await settle(10);
    };
    let frame = host.querySelector("iframe") as HTMLIFrameElement;
    vi.spyOn(frame.contentWindow as Window, "postMessage").mockImplementation(() => undefined);
    await signal(frame, { type: "binodex-embed:ready" });
    expect(minted).toBe(1);
    await signal(frame, { type: "binodex-embed:error", message: "ticket_expired" });
    await settle(1050);
    frame = host.querySelector("iframe") as HTMLIFrameElement;
    const postMessage = vi.spyOn(frame.contentWindow as Window, "postMessage").mockImplementation(() => undefined);
    await signal(frame, { type: "binodex-embed:ready" });
    expect(minted).toBe(2);
    expect(postMessage.mock.calls[0]?.[0]).toMatchObject({ type: "binodex-embed:requisites-init", ticket: "wft_2", deposit_id: "dep_ru_1" });

    await signal(frame, { type: "binodex-embed:error", message: "rate_limited" });
    const error = host.querySelector('[data-binodex-pay="requisites-frame"] [data-binodex-pay="error"]');
    expect(error?.getAttribute("data-error")).toBe("RATE_LIMITED");
    await click(error?.querySelector('[data-binodex-pay="retry"]') ?? null);
    expect(host.querySelector("iframe")).not.toBeNull();
  });

  it("switches to the iframe fallback when the pay API is switched off mid-session", async () => {
    let disabled = false;
    const api = depositApi((request) =>
      disabled && request.path.startsWith("/broker/pay/") ? payErrorReply() : undefined,
    );
    await render(
      <Pay.Root mode="deposit" createSession={sessionSpy()} fetch={api.fetch} fallback="iframe" locale="en">
        <Pay.DepositForm />
      </Pay.Root>,
    );
    expect(part("deposit-form")).not.toBeNull();
    disabled = true;
    await pickOnramp();
    await settle(10);
    expect(part("root")?.getAttribute("data-fallback")).toBe("iframe");
    expect(new URL(host.querySelector("iframe")?.getAttribute("src") ?? "").pathname).toBe("/embed/pay");
  });

  it("isolates numbers and requisites as LTR inside an RTL root", async () => {
    const api = depositApi();
    await render(
      <Pay.Root mode="deposit" createSession={sessionSpy()} fetch={api.fetch} locale="ar">
        <Pay.DepositForm />
      </Pay.Root>,
    );
    await submitSbp();
    const code = host.querySelector<HTMLElement>('[data-binodex-pay="requisites-row"][data-kind="card"] [data-binodex-pay="requisite-value"]');
    expect(code?.textContent).toBe("2200 0000 0000 0000");
    expect(code?.getAttribute("dir")).toBe("ltr");
    expect(code?.style.unicodeBidi).toBe("isolate");
    const amount = host.querySelector<HTMLElement>('[data-binodex-pay="requisites-row"][data-kind="amount"] [data-binodex-pay="requisite-value"]');
    expect(amount?.getAttribute("dir")).toBe("ltr");
  });

  it("falls back to an https QR image and refuses an http one", async () => {
    const qr = (imageUrl: string) =>
      depositApi((request) =>
        request.method === "POST" && request.path === "/broker/pay/deposits"
          ? json(201, fiatDeposit({ next_action: { type: "qr", payload: null, image_url: imageUrl } }))
          : undefined,
      );
    const safe = qr("https://qr.example/1.png");
    await render(
      <Pay.Root mode="deposit" createSession={sessionSpy()} fetch={safe.fetch} locale="en">
        <Pay.DepositForm />
      </Pay.Root>,
    );
    await submitSbp();
    expect(host.querySelector('img[data-binodex-pay="qr"]')?.getAttribute("src")).toBe("https://qr.example/1.png");

    await act(async () => {
      root.unmount();
    });
    root = createRoot(host);
    const unsafe = qr("http://qr.example/1.png");
    await render(
      <Pay.Root mode="deposit" createSession={sessionSpy()} fetch={unsafe.fetch} locale="en">
        <Pay.DepositForm />
      </Pay.Root>,
    );
    await submitSbp();
    expect(host.querySelector("img")).toBeNull();
  });

  it("moves focus into the new step when the focused control disappears", async () => {
    const api = depositApi();
    await render(
      <Pay.Root mode="deposit" createSession={sessionSpy()} fetch={api.fetch} locale="en">
        <Pay.DepositForm />
      </Pay.Root>,
    );
    const option = host.querySelector<HTMLElement>('[data-binodex-pay="method-option"][data-kind="crypto"]');
    option?.focus();
    await click(option);
    expect(option?.isConnected).toBe(false);
    expect(document.activeElement).not.toBe(document.body);
    expect(part("deposit-form")?.contains(document.activeElement)).toBe(true);
  });

  it("stops every poller when Root unmounts", async () => {
    vi.useFakeTimers();
    const api = depositApi();
    await act(async () => {
      root.render(
        <Pay.Root mode="deposit" createSession={sessionSpy()} fetch={api.fetch} locale="en">
          <Pay.DepositForm />
        </Pay.Root>,
      );
      await vi.advanceTimersByTimeAsync(10);
    });
    await act(async () => {
      host.querySelector<HTMLElement>('[data-binodex-pay="method-option"][data-kind="crypto"]')?.click();
      await vi.advanceTimersByTimeAsync(10);
    });
    await act(async () => {
      host.querySelector<HTMLElement>('[data-binodex-pay="network-picker"] [data-binodex-pay="route-trigger"]')?.click();
      await vi.advanceTimersByTimeAsync(10);
    });
    await act(async () => {
      host.querySelector<HTMLElement>('[data-binodex-pay="network-option"][data-chain="bsc"]')?.click();
      await vi.advanceTimersByTimeAsync(10);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(api.calls("/broker/pay/deposits/dep_crypto_1").length).toBeGreaterThan(0);
    expect(api.calls("/broker/pay/activity").length).toBeGreaterThan(0);
    await act(async () => {
      root.unmount();
      await vi.advanceTimersByTimeAsync(10);
    });
    const count = api.requests.length;
    await vi.advanceTimersByTimeAsync(120_000);
    expect(api.requests.length).toBe(count);
    root = createRoot(host);
  });
});

describe("regional domains", () => {
  const added: { family: string; source: string; weight?: string }[] = [];

  beforeEach(() => {
    added.length = 0;
    vi.stubGlobal(
      "FontFace",
      class {
        constructor(
          public family: string,
          public source: string,
          public descriptors: { weight?: string },
        ) {}
      },
    );
    Object.defineProperty(document, "fonts", {
      configurable: true,
      value: {
        add: (face: { family: string; source: string; descriptors: { weight?: string } }) =>
          added.push({ family: face.family, source: face.source, weight: face.descriptors.weight }),
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete (document as { fonts?: unknown }).fonts;
  });

  const ruOnly = () => depositApi((request) => (request.base === API_A ? "network-error" : undefined));

  const mount = async (
    api: ReturnType<typeof depositApi>,
    props: { assetBaseUrl?: string; fontBaseUrl?: string | false } = {},
  ) => {
    await render(
      <Pay.Root mode="deposit" createSession={sessionSpy()} fetch={api.fetch} locale="en" {...props}>
        <Pay.DepositForm />
      </Pay.Root>,
    );
    await settle(10);
  };

  const imageSources = () =>
    Array.from(host.querySelectorAll("img"))
      .map((image) => image.getAttribute("src") ?? "")
      .filter((src) => src.includes("/img/"));

  it("loads logos and icons from the Binodex domain whose API answered", async () => {
    await mount(ruOnly());
    const sources = imageSources();
    expect(sources.length).toBeGreaterThan(0);
    expect(sources.every((src) => src.startsWith(`${WIDGET_B}/img/`))).toBe(true);
  });

  it("registers Gilroy from the reachable domain first, the other one as a fallback", async () => {
    await mount(ruOnly());
    expect(added.map((face) => face.weight)).toEqual(["400", "500", "600", "700"]);
    expect(added.every((face) => face.family === "Gilroy")).toBe(true);
    expect(added[0]?.source).toBe(
      `url("${WIDGET_B}/fonts/Gilroy-Regular.woff2") format("woff2"), url("${WIDGET_A}/fonts/Gilroy-Regular.woff2") format("woff2")`,
    );
  });

  it("keeps the broker's own hosts when they are given", async () => {
    await mount(ruOnly(), { assetBaseUrl: "https://cdn.example", fontBaseUrl: "https://cdn.example/fonts" });
    expect(imageSources().every((src) => src.startsWith("https://cdn.example/img/"))).toBe(true);
    expect(added[0]?.source).toBe('url("https://cdn.example/fonts/Gilroy-Regular.woff2") format("woff2")');
  });

  it("loads no font when fontBaseUrl is false", async () => {
    await mount(depositApi(), { fontBaseUrl: false });
    expect(added).toHaveLength(0);
  });
});
