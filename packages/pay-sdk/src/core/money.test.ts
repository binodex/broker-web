import { describe, expect, it } from "vitest";
import {
  formatAmountMax2,
  formatTokenAmount,
  compareDecimal,
  formatAmount,
  formatDecimal,
  formatMoney,
  formatPayingAmount,
  formatPercentValue,
  formatUsd,
  parseInrAmount,
  sanitizeAmountInput,
  toFixed2,
} from "./money.js";
import { formatMinLimit, formatNativeRange } from "./rules/limits.js";
import { isValidWithdrawAddress } from "./rules/address.js";
import { acceptSlippagePct } from "./rules/slippage.js";

describe("formatAmount: rupees", () => {
  it("groups the Indian way (en-IN): a lakh is 1,00,000", () => {
    expect(formatAmount(300, "INR")).toBe("300");
    expect(formatAmount(1000, "INR")).toBe("1,000");
    expect(formatAmount(100000, "INR")).toBe("1,00,000");
    expect(formatAmount("1003.50", "INR")).toBe("1,003.5");
  });

  it("empty and non-numbers give an empty string", () => {
    expect(formatAmount(null, "INR")).toBe("");
    expect(formatAmount(undefined, "INR")).toBe("");
    expect(formatAmount("abc", "INR")).toBe("");
  });

  it("uses Latin digits for every currency", () => {
    expect(formatAmount(1000000, "KZT")).toMatch(/^1\s000\s000$/);
    expect(formatMoney("5000", "RUB", "ar-SA")).toBe("5\u00a0000 ₽");
    expect(formatMoney("0.3", "USD", "ar-SA")).not.toMatch(/[\u0660-\u0669]/);
  });
});

describe("formatMoney: the web's amounts", () => {
  it("writes dollars the same way in every language", () => {
    expect(formatMoney("10", "USD", "ru-RU")).toBe("$10.00");
    expect(formatUsd("0.3")).toBe("$0.30");
    expect(formatUsd("1250")).toBe("$1250.00");
  });

  it("groups fiat by its currency and keeps the symbol after a space", () => {
    expect(formatMoney("5007", "RUB", "en-US")).toBe("5\u00a0007 ₽");
    expect(formatMoney("5007.5", "RUB", "ru-RU")).toBe("5\u00a0007,5 ₽");
    expect(formatMoney("1000", "UAH", "uk-UA")).toBe("1\u00a0000 ₴");
    expect(formatMoney("100000", "INR")).toBe("1,00,000 ₹");
    expect(formatMoney("19.7", "USDT", "ru-RU")).toBe("19,7\u00a0USDT");
    expect(formatMoney("0.000012345", "BTC", "en-US")).toBe("0.00001235\u00a0BTC");
    expect(formatPercentValue("0.05", "ru-RU")).toBe("0,05");
    expect(formatDecimal("1234.5", "de-DE")).toBe("1.234,5");
  });

  it("shows the amount to pay with kopecks and hryvnia cents, as the paying screen does", () => {
    expect(formatPayingAmount("22227", "RUB")).toBe("22\u00a0227,00 ₽");
    expect(formatPayingAmount("1500", "UAH")).toBe("1\u00a0500,00 ₴");
    expect(formatPayingAmount("1003", "INR")).toBe("1,003 ₹");
    expect(formatPayingAmount("50000", "KZT")).toBe("50\u00a0000 ₸");
  });

  it("keeps empty input empty", () => {
    expect(formatMoney(null, "USD", "ru-RU")).toBe("");
    expect(formatMoney("abc", "USDT", "ru-RU")).toBe("");
    expect(formatPayingAmount(null, "RUB")).toBe("");
  });
});

describe("parseInrAmount", () => {
  it("without commas: as is", () => {
    expect(parseInrAmount("1000")).toBe(1000);
    expect(parseInrAmount(" 2500 ")).toBe(2500);
    expect(parseInrAmount("1000.5")).toBe(1000.5);
    expect(parseInrAmount("")).toBeNaN();
  });

  it("commas as group separators, as the form hint writes them", () => {
    expect(parseInrAmount("1,000")).toBe(1000);
    expect(parseInrAmount("10,000")).toBe(10000);
    expect(parseInrAmount("1,00,000")).toBe(100000);
    expect(parseInrAmount("100,000")).toBe(100000);
    expect(parseInrAmount("1,000.50")).toBe(1000.5);
  });

  it("a comma out of place is NaN, never an amount a hundred times larger", () => {
    expect(parseInrAmount("500,50")).toBeNaN();
    expect(parseInrAmount("1,0000")).toBeNaN();
    expect(parseInrAmount("1000,")).toBeNaN();
    expect(parseInrAmount(",500")).toBeNaN();
    expect(parseInrAmount("1.000,50")).toBeNaN();
  });
});

describe("sanitizeAmountInput", () => {
  it.each([
    ["12.345", "12.34"],
    ["1.2.3", "1.23"],
    ["00012", "12"],
    ["0.5", "0.5"],
    ["abc12", "12"],
    ["12,5", "12.5"],
    ["1234567890123456", "123456789012"],
    ["", ""],
  ])("%s -> %s", (raw, expected) => {
    expect(sanitizeAmountInput(raw)).toBe(expected);
  });
});

describe("decimal helpers", () => {
  it("compares decimal strings without float rounding", () => {
    expect(compareDecimal("10", "10.00")).toBe(0);
    expect(compareDecimal("9.99", "10")).toBe(-1);
    expect(compareDecimal("100.01", "100.001")).toBe(1);
    expect(compareDecimal("0.1", "0.10000000000000000001")).toBe(-1);
    expect(compareDecimal("abc", "1")).toBeNull();
  });

  it("formats USD with two decimals and floors max amounts", () => {
    expect(formatUsd("51.2")).toBe("$51.20");
    expect(toFixed2("120.009")).toBe("120.00");
    expect(toFixed2("125.4")).toBe("125.40");
  });
});

describe("limits", () => {
  it("shows the native minimum when set, otherwise the USD one, as the web does", () => {
    expect(formatMinLimit({ minUsd: "5", minNative: "0.050000" }, "SOL")).toBe("0.05 SOL");
    expect(formatMinLimit({ minUsd: "5", minNative: null }, "SOL")).toBe("$5.00");
    expect(formatMinLimit({ minUsd: "1500", minNative: "" }, "USDT")).toBe("$1500.00");
    expect(formatMinLimit({ minUsd: "5", minNative: "abc" }, "SOL")).toBe("abc SOL");
  });

  it("builds native ranges", () => {
    expect(formatNativeRange({ minUsd: "1", minNative: "0.050000", maxNative: "10.00" }, "SOL")).toEqual({
      kind: "range",
      text: "0.05–10 SOL",
    });
    expect(formatNativeRange({ minUsd: "1", minNative: "0.05" }, "SOL")).toEqual({ kind: "from", amount: "0.05 SOL" });
    expect(formatNativeRange({ minUsd: "1", maxNative: "10" }, "SOL")).toEqual({ kind: "upTo", amount: "10 SOL" });
    expect(formatNativeRange({ minUsd: "1" }, "SOL")).toBeNull();
  });
});

describe("address hints", () => {
  it.each([
    ["bsc", "0x52908400098527886E0F7030069857D2E4169EE7", true],
    ["bsc", "0x5290", false],
    ["solana", "7EcDhSYGxXyscszYEp35KHN8vvw3svAuLKTzXwCFLtV", true],
    ["tron", "TQn9Y2khEsLJW1ChVWFMSMeRDow5KcbLSE", true],
    ["tron", "0x52908400098527886E0F7030069857D2E4169EE7", false],
    ["bitcoin", "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq", true],
    ["bitcoin", "1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2", true],
    ["eth", "  ", false],
  ])("%s %s -> %s", (chain, address, valid) => {
    expect(isValidWithdrawAddress(chain, address)).toBe(valid);
  });
});

describe("slippage acceptance", () => {
  it("adds one display unit so the rounded percent clears the gate", () => {
    expect(acceptSlippagePct("17.55")).toBe(17.56);
    expect(acceptSlippagePct(99.995)).toBe(100);
    expect(acceptSlippagePct("x")).toBeNull();
  });
});

describe("formatTokenAmount", () => {
  it("truncates to the token precision with Latin digits", () => {
    expect(formatTokenAmount("99.559", "USDT")).toBe("99.55");
    expect(formatTokenAmount(0.123456789, "BTC")).toBe("0.12345678");
    expect(formatTokenAmount(1.23456789, "SOL")).toBe("1.2345");
    expect(formatTokenAmount(1234.5, "ETH")).toBe("1,234.5");
    expect(formatTokenAmount(0, "USDC")).toBe("0.00");
    expect(formatTokenAmount(null, "ETH")).toBe("0");
  });

  it("never shows real dust as zero", () => {
    expect(formatTokenAmount(0.0001, "USDT")).toBe("0.0001");
  });
});

describe("formatAmountMax2", () => {
  it("floors to cents and drops trailing zeros like the web footer", () => {
    expect(formatAmountMax2(100)).toBe("100");
    expect(formatAmountMax2("120.459")).toBe("120.45");
    expect(formatAmountMax2("x")).toBe("0");
  });
});
