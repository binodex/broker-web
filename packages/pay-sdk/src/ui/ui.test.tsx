import { act, type ReactElement } from "react";
import { createRoot, type Root as ReactRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTranslator } from "../core/i18n/index.js";
import * as ui from "./index.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const noop = () => undefined;
const ADDRESS = "0x52908400098527886E0F7030069857D2E4169EE7";

const VIEWS: Record<string, ReactElement> = {
  PayCard: (
    <ui.PayCard title="Deposit" subtitle="Balance: $1425.00" onBack={noop} onClose={noop}>
      body
    </ui.PayCard>
  ),
  PayHeader: <ui.PayHeader title="Deposit" subtitle="Balance" onClose={noop} />,
  PayBody: <ui.PayBody>body</ui.PayBody>,
  Divider: <ui.Divider />,
  CloseButton: <ui.CloseButton />,
  BackButton: <ui.BackButton />,
  EntryTabs: (
    <ui.EntryTabs
      value="crypto"
      onChange={noop}
      tabs={[
        { id: "crypto", label: "Crypto" },
        { id: "card", label: "Card" },
      ]}
    />
  ),
  EntryOptions: (
    <ui.EntryOptions
      onSelect={noop}
      options={[
        { id: "transfer", title: "Transfer crypto", subtitle: "No limit", icons: ui.cryptoStackIcons() },
        { id: "wallet", title: "Wallet", subtitle: "Soon", icon: <ui.WalletIcon />, disabled: true },
      ]}
    />
  ),
  MethodGrid: (
    <ui.MethodGrid
      selectedId="sbp"
      onSelect={noop}
      badgeTitles={{ qr: "QR", pdf: "PDF" }}
      methods={[
        { id: "sbp", label: "SBP", subtitle: "Any bank", minLabel: "from 3000 ₽" },
        { id: "sber_qr", label: "Sber", subtitle: "QR" },
        { id: "unknown", label: "New bank" },
      ]}
    />
  ),
  MethodsNotice: <ui.MethodsNotice variant="empty">Nothing</ui.MethodsNotice>,
  Field: <ui.Field label="Payment method">x</ui.Field>,
  RoutePicker: (
    <ui.RoutePicker
      value={{ currency: "USDT", network: "tron" }}
      onChange={noop}
      minLabel="Min: $10.00"
      coins={[{ value: "USDT", label: "USDT", icon: <ui.TokenIcon symbol="USDT" size={24} /> }]}
      networks={[{ value: "tron", label: "Tron", icon: <ui.ChainIcon chainId="tron" size={24} /> }]}
    />
  ),
  RouteGrid: <ui.RouteGrid>x</ui.RouteGrid>,
  RouteColumn: (
    <ui.RouteColumn label="Token" value={null} options={[{ value: "USDT", label: "USDT" }]} onSelect={noop} />
  ),
  CountrySelect: <ui.CountrySelect value="RU" onChange={noop} />,
  AmountField: <ui.AmountField label="Amount" suffix="RUB" value="5000" onChange={noop} hint="From 500" />,
  WithdrawAmount: (
    <ui.AmountField
      variant="withdraw"
      label="Amount (USD)"
      suffix="USD"
      value="100"
      onChange={noop}
      onMax={noop}
      footer={["$100", "Balance: $120"]}
      error="Too much"
    />
  ),
  TextField: <ui.TextField label="Recipient address" value={ADDRESS} onChange={noop} placeholder="0x..." />,
  TwoFactorField: <ui.TwoFactorField label="2FA code" value="123" onChange={noop} />,
  SubmitButton: <ui.SubmitButton>Go</ui.SubmitButton>,
  SubmitLink: <ui.SubmitLink href="https://pay.example/x">Open</ui.SubmitLink>,
  LinkButton: <ui.LinkButton>Cancel</ui.LinkButton>,
  RetryButton: <ui.RetryButton />,
  Hint: <ui.Hint>Sign in to make a deposit.</ui.Hint>,
  BrandLogo: <ui.BrandLogo src="/img/trade/logo.svg" />,
  CardTab: <ui.CardTab>country</ui.CardTab>,
  RailForm: <ui.RailForm variant="stack">fields</ui.RailForm>,
  ReceiptBlock: <ui.ReceiptBlock>receipt</ui.ReceiptBlock>,
  ErrorBox: <ui.ErrorBox>Failed</ui.ErrorBox>,
  Notice: <ui.Notice variant="receipt">Attach the receipt</ui.Notice>,
  Skeleton: <ui.Skeleton height={48} />,
  Loader: <ui.Loader />,
  Summary: <ui.Summary rows={[{ label: "Fee", value: "5%" }, { label: "You receive", value: "≈ $51.20" }]} />,
  QuoteRows: (
    <ui.QuoteRows
      rows={[
        { key: "receive", label: "You receive", value: "~99.55 USDT", icon: <ui.TokenIcon symbol="USDT" /> },
        { key: "fee", label: "Network fee", value: "~$0.45" },
        { key: "slippage", label: "Slippage", value: "~3%", tone: "warning" },
      ]}
    />
  ),
  QuoteSkeleton: <ui.QuoteRows rows={[]} loading />,
  DetailsAccordion: (
    <ui.DetailsAccordion label="Price impact:" value="< 1%" rows={[{ label: "Estimated fee:", value: "~$0.20" }]} />
  ),
  WithdrawDetails: (
    <ui.DetailsAccordion variant="withdraw" defaultOpen label="More" rows={[{ label: "Hash", value: "0xabc…def" }]} />
  ),
  QrSvg: <ui.QrSvg value={ADDRESS} />,
  QrCode: <ui.QrCode value={ADDRESS} overlay={<ui.TokenIcon symbol="USDC" size={48} />} badge={<ui.ChainIcon chainId="base" size={20} />} />,
  CopyButton: <ui.CopyButton value={ADDRESS} label="Address" />,
  CreditBanner: <ui.CreditBanner title="Deposit credited" subtitle="+$25.50 added" />,
  CryptoAddressCard: (
    <ui.CryptoAddressCard
      address={ADDRESS}
      overlay={<ui.TokenIcon symbol="USDT" size={48} />}
      warning="Deposit only USDT on Tron"
      highFee="High network fee on Tron — 1.50$"
      details={<ui.DetailsAccordion label="Fee:" rows={[]} />}
    />
  ),
  CryptoAddressLoading: <ui.CryptoAddressCard address={null} loading />,
  Requisites: (
    <ui.Requisites
      rows={[
        { key: "bank", label: "Recipient's bank", value: "Sber" },
        { key: "card", label: "Card number", value: "2200 0000 0000 0000", copy: "2200000000000000", mono: true },
        { key: "amount", label: "Amount to transfer", value: "5 000 ₽", copy: "5000", accent: true },
      ]}
      note="Transfer exactly 5 000 ₽"
    />
  ),
  StatusPanel: (
    <ui.StatusPanel
      tone="pending"
      statusLabel="Waiting for payment"
      amountLabel="5 000 ₽"
      hint="Transfer the money"
      expiresLabel="Valid for: 14:59"
      actions={<ui.LinkButton>Cancel</ui.LinkButton>}
    />
  ),
  StatusPill: <ui.StatusPill tone="failed" label="Payment failed" />,
  QrImageCard: <ui.QrImageCard>qr</ui.QrImageCard>,
  PdfReceiptWarning: <ui.PdfReceiptWarning />,
  ReceiptAttached: <ui.ReceiptAttached />,
  ReceiptForm: <ui.ReceiptForm onSubmit={noop} pdfOnly />,
  PollNotice: <ui.PollNotice health="retrying" />,
  GeoBlock: <ui.GeoBlock onClose={noop} />,
  SlippageWarning: <ui.SlippageWarning title="High slippage: ~3%" body="You will receive about 97 USDT" onAccept={noop} />,
  StatusSteps: <ui.StatusSteps />,
  ResultIcon: <ui.ResultIcon state="success" />,
  StatusCard: <ui.StatusCard rows={[{ label: "Status", value: <ui.StatusText tone="pending">Processing</ui.StatusText> }]} />,
  WithdrawResult: (
    <ui.WithdrawResult state="failed" title="Withdrawal error" subtitle="Funds returned" rows={[{ label: "Status", value: "Error" }]} />
  ),
  PayUiRoot: (
    <ui.PayUiRoot theme="dark" skin="black" locale="ru" t={createTranslator("ru")}>
      <ui.Loader />
    </ui.PayUiRoot>
  ),
};

describe("ui views render on the server", () => {
  it.each(Object.entries(VIEWS))("%s", (_, element) => {
    const html = renderToString(element);
    expect(html.length).toBeGreaterThan(0);
    expect(html).toContain("data-binodex-pay=");
  });

  it("covers every exported view", () => {
    const components = Object.entries(ui)
      .filter(([name, value]) => /^[A-Z]/.test(name) && (typeof value === "function" || (typeof value === "object" && value !== null && "$$typeof" in value)))
      .map(([name]) => name);
    const excluded = new Set(["PayUiProvider", "BadgeIcon", "PayUiValueProvider", "ChainIcon", "TokenIcon", "WalletIcon", "TransferCryptoIcon", "CardIcon", "SuccessIcon", "FailIcon", "IconStack", "PanelAmount", "PanelHint", "PayActions", "PayingPanel", "ExpiresLine", "StatusText"]);
    for (const name of components) {
      if (excluded.has(name)) continue;
      expect(Object.keys(VIEWS), name).toContain(name);
    }
  });

  it("renders without the styled classes when unstyled", () => {
    const html = renderToString(
      <ui.PayUiProvider unstyled>
        {Object.entries(VIEWS)
          .filter(([name]) => name !== "PayUiRoot")
          .map(([name, element]) => (
            <div key={name}>{element}</div>
          ))}
      </ui.PayUiProvider>,
    );
    expect(html).not.toMatch(/class="[^"]*\bbp-/);
    expect(html).toContain('data-binodex-pay="method-card"');
  });

  it("translates through the provider and keeps the sensitive markers", () => {
    const html = renderToString(
      <ui.PayUiProvider locale="ru" t={createTranslator("ru")}>
        <ui.PdfReceiptWarning />
        <ui.CryptoAddressCard address={ADDRESS} />
      </ui.PayUiProvider>,
    );
    expect(html).toContain("Без PDF-чека");
    expect(html).toContain("Ваш адрес для пополнения");
    expect(html).toContain('data-hj-suppress=""');
    expect(html).toContain("ym-hide-content");
  });

  it("resolves remote logos against the asset base", () => {
    const html = renderToString(
      <ui.PayUiProvider assetBaseUrl="https://cdn.example/">
        <ui.MethodGrid selectedId={null} onSelect={noop} methods={[{ id: "sbp", label: "SBP" }]} />
        <ui.CountrySelect value="DE" onChange={noop} />
      </ui.PayUiProvider>,
    );
    expect(html).toContain('src="https://cdn.example/img/banks/sbp.webp"');
    expect(html).toContain('src="https://cdn.example/img/trade/flags/de.svg"');
  });
});

describe("ui views in the browser", () => {
  let host: HTMLDivElement;
  let root: ReactRoot;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    vi.restoreAllMocks();
  });

  const render = async (element: ReactElement) => {
    await act(async () => root.render(element));
  };
  const click = async (element: Element | null) => {
    if (!element) throw new Error("element not found");
    await act(async () => (element as HTMLElement).click());
  };
  const q = (selector: string) => host.querySelector<HTMLElement>(selector);

  it("selects methods and tabs through callbacks only", async () => {
    const onSelect = vi.fn();
    const onTab = vi.fn();
    await render(
      <>
        <ui.EntryTabs value="crypto" onChange={onTab} tabs={[{ id: "crypto", label: "Crypto" }, { id: "card", label: "Card" }]} />
        <ui.MethodGrid selectedId="sbp" onSelect={onSelect} methods={[{ id: "sbp", label: "SBP" }, { id: "c2c", label: "C2C" }]} />
      </>,
    );
    await click(q('[data-tab="card"]'));
    expect(onTab).toHaveBeenCalledWith("card");
    const cards = host.querySelectorAll('[data-binodex-pay="method-card"]');
    expect(cards[0]?.getAttribute("aria-checked")).toBe("true");
    expect(cards[1]?.querySelector('[data-badge="pdf"]')).not.toBeNull();
    await click(cards[1] ?? null);
    expect(onSelect).toHaveBeenCalledWith("c2c");
  });

  it("falls back to the glyph when a logo does not load", async () => {
    await render(<ui.MethodGrid selectedId={null} onSelect={noop} methods={[{ id: "tinkoff", label: "T-Bank" }]} />);
    const img = q("img");
    expect(img).not.toBeNull();
    await act(async () => img?.dispatchEvent(new Event("error")));
    expect(q("img")).toBeNull();
    expect(q('[data-binodex-pay="method-card"]')?.textContent).toContain("Т");
  });

  it("opens one route list at a time and reports the pick", async () => {
    const onChange = vi.fn();
    await render(
      <ui.RoutePicker
        value={{ currency: "USDT", network: null }}
        onChange={onChange}
        coins={[{ value: "USDT", label: "USDT" }, { value: "USDC", label: "USDC" }]}
        networks={[{ value: "bsc", label: "BSC", attrs: { "data-chain": "bsc" } }]}
      />,
    );
    const triggers = host.querySelectorAll('[data-binodex-pay="route-trigger"]');
    await click(triggers[0] ?? null);
    expect(host.querySelectorAll('[role="listbox"]')).toHaveLength(1);
    await click(triggers[1] ?? null);
    expect(host.querySelectorAll('[role="listbox"]')).toHaveLength(1);
    await click(q('[data-binodex-pay="network-option"][data-chain="bsc"]'));
    expect(onChange).toHaveBeenCalledWith({ currency: "USDT", network: "bsc" }, "network");
    expect(host.querySelectorAll('[role="listbox"]')).toHaveLength(0);
  });

  it("filters countries by name or code and picks one", async () => {
    const onChange = vi.fn();
    await render(<ui.CountrySelect value="RU" onChange={onChange} countries={["RU", "KZ", "UA", "DE"]} />);
    expect(q('[data-binodex-pay="country-name"]')?.textContent).toBe("Russia");
    await click(q('[data-binodex-pay="country-trigger"]'));
    const input = q('[data-binodex-pay="country-search"]') as HTMLInputElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, "kz");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const options = host.querySelectorAll('[data-binodex-pay="country-option"]');
    expect(options).toHaveLength(1);
    await click(options[0] ?? null);
    expect(onChange).toHaveBeenCalledWith("KZ");
  });

  it("keeps sanitizing the amount and wires the error to the input", async () => {
    const onChange = vi.fn();
    await render(<ui.AmountField id="amount" label="Amount" value="" onChange={onChange} error="Too small" />);
    const input = q("#amount") as HTMLInputElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, "12a,5");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(onChange).toHaveBeenCalledWith("12,5");
    expect(input.getAttribute("aria-describedby")).toBe("amount-error");
    expect(q("#amount-error")?.getAttribute("role")).toBe("alert");
  });

  it("copies the raw requisite and labels the button", async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    await render(
      <ui.Requisites
        rows={[{ key: "card", label: "Card number", value: "2200 0000 0000 0000", copy: "2200000000000000", mono: true }]}
        note="Exact amount"
      />,
    );
    const button = q('[data-binodex-pay="copy"]');
    expect(button?.getAttribute("aria-label")).toBe("Copy: Card number");
    await click(button);
    expect(writeText).toHaveBeenCalledWith("2200000000000000");
    expect(q('[data-binodex-pay="copy"]')?.hasAttribute("data-copied")).toBe(true);
    expect(q('[data-binodex-pay="requisite-value"]')?.getAttribute("dir")).toBe("ltr");
  });

  it("rejects a non-PDF receipt on a PDF-only rail and submits a PDF", async () => {
    const onSubmit = vi.fn();
    await render(<ui.ReceiptForm onSubmit={onSubmit} pdfOnly />);
    const input = host.querySelector<HTMLInputElement>('input[type="file"]')!;
    expect(input.getAttribute("accept")).toBe("application/pdf");
    const pick = async (file: File) => {
      Object.defineProperty(input, "files", { value: [file], configurable: true });
      await act(async () => input.dispatchEvent(new Event("change", { bubbles: true })));
    };
    await pick(new File(["x"], "shot.png", { type: "image/png" }));
    expect(q('[data-binodex-pay="field-error"]')?.textContent).toContain("PDF");
    expect((q('[data-binodex-pay="receipt-submit"]') as HTMLButtonElement).disabled).toBe(true);
    await pick(new File(["%PDF"], "receipt.pdf", { type: "" }));
    expect(q('[data-binodex-pay="field-error"]')).toBeNull();
    await click(q('[data-binodex-pay="receipt-submit"]'));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("hands a picked receipt to the owner when it controls the file", async () => {
    const onFileChange = vi.fn();
    const onPreview = vi.fn();
    const image = new File(["x"], "shot.png", { type: "image/png" });
    Object.defineProperty(URL, "createObjectURL", { value: () => "blob:preview", configurable: true });
    Object.defineProperty(URL, "revokeObjectURL", { value: () => undefined, configurable: true });
    await render(<ui.ReceiptForm onSubmit={noop} file={null} onFileChange={onFileChange} onPreview={onPreview} />);
    const input = host.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(input, "files", { value: [image], configurable: true });
    await act(async () => input.dispatchEvent(new Event("change", { bubbles: true })));
    expect(onFileChange).toHaveBeenCalledWith(image);
    expect(q('[data-binodex-pay="field-error"]')).toBeNull();
    await render(<ui.ReceiptForm onSubmit={noop} file={image} onFileChange={onFileChange} onPreview={onPreview} />);
    await click(q(".bp-preview-chip"));
    expect(onPreview).toHaveBeenCalledTimes(1);
    expect(q(".bp-preview-hint")?.textContent).toBe("Tap to view");
  });

  it("toggles the details accordion", async () => {
    await render(<ui.DetailsAccordion variant="withdraw" label="More" rows={[{ label: "Hash", value: "0xabc" }]} />);
    expect(q('[data-binodex-pay="details-row"]')).toBeNull();
    await click(q('[data-binodex-pay="details-toggle"]'));
    expect(q('[data-binodex-pay="details-row"]')?.textContent).toContain("0xabc");
  });

  it("builds the Gilroy font faces for a self-hosted base", () => {
    const css = ui.fontFaceCss("https://cdn.example/fonts/");
    expect(css).toContain('url("https://cdn.example/fonts/Gilroy-SemiBold.woff2")');
    expect(css.match(/@font-face/g)).toHaveLength(4);
  });
});
