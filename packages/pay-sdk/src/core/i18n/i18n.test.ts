import { afterEach, describe, expect, it, vi } from "vitest";
import { PayError, SERVER_ERROR_CODES, CLIENT_ERROR_CODES } from "../errors.js";
import { en } from "./en.js";
import {
  CATALOGS,
  LOCALES,
  createTranslator,
  errorMessage,
  formatEta,
  isRtlLocale,
  methodCopy,
  resolveLocale,
} from "./index.js";

const withNavigatorLanguage = (value: string) =>
  vi.spyOn(navigator, "language", "get").mockReturnValue(value);

afterEach(() => {
  vi.restoreAllMocks();
});

describe("resolveLocale", () => {
  it("accepts full and short codes, case and whitespace insensitive", () => {
    expect(resolveLocale("ru-RU")).toBe("ru");
    expect(resolveLocale(" RU ")).toBe("ru");
    expect(resolveLocale("uk")).toBe("ua");
    expect(resolveLocale("uk-UA")).toBe("ua");
    expect(resolveLocale("ua")).toBe("ua");
    expect(resolveLocale("pt_BR")).toBe(resolveLocale(null));
  });

  it("falls back to the browser language when the value is absent or junk", () => {
    withNavigatorLanguage("de-DE");
    expect(resolveLocale(null)).toBe("de");
    expect(resolveLocale("klingon")).toBe("de");
  });

  it("maps Russian-speaking browser languages to ru", () => {
    withNavigatorLanguage("kk");
    expect(resolveLocale(undefined)).toBe("ru");
  });

  it("falls back to English when nothing matches", () => {
    withNavigatorLanguage("pt-BR");
    expect(resolveLocale("")).toBe("en");
  });

  it("marks Arabic as RTL", () => {
    expect(isRtlLocale("ar")).toBe(true);
    expect(isRtlLocale("ru")).toBe(false);
  });
});

describe("catalogs", () => {
  it("cover every key in every locale with the same placeholders", () => {
    const keys = Object.keys(en) as (keyof typeof en)[];
    for (const locale of LOCALES) {
      const catalog = CATALOGS[locale];
      expect(Object.keys(catalog).sort()).toEqual([...keys].sort());
      for (const key of keys) {
        expect(catalog[key].trim().length).toBeGreaterThan(0);
        const placeholders = (text: string) => (text.match(/\{\w+\}/g) ?? []).sort();
        expect(placeholders(catalog[key])).toEqual(placeholders(en[key]));
      }
    }
  });

  it("has a message for every error code", () => {
    for (const code of [...SERVER_ERROR_CODES, ...CLIENT_ERROR_CODES]) {
      expect(en).toHaveProperty(`error.${code}`);
    }
  });
});

describe("translator", () => {
  it("interpolates and lets the broker override any key", () => {
    const t = createTranslator("en", { "submit.deposit": "Pay now" });
    expect(t("submit.deposit")).toBe("Pay now");
    expect(t("amount.min", { amount: "$10.00" })).toBe("Minimum $10.00");
  });

  it("renders errors from the code, never from the server message", () => {
    const t = createTranslator("ru");
    const rate = new PayError("RATE_LIMITED", "server says something", {
      details: { retryAfterSeconds: 125 },
    });
    expect(errorMessage(t, rate, "ru")).toBe("Слишком много попыток. Попробуйте через 3 мин.");
    expect(errorMessage(t, new PayError("RATE_LIMITED"), "ru")).toBe(
      "Слишком много попыток. Попробуйте позже.",
    );
    const small = new PayError("AMOUNT_TOO_SMALL", "x", { details: { min: "500", currency: "RUB" } });
    expect(errorMessage(t, small, "ru")).toBe("Сумма меньше минимальной: 500 ₽.");
    expect(errorMessage(t, new PayError("ORIGIN_MISMATCH", "secret"), "ru")).not.toContain("secret");
  });

  it("formats ETA", () => {
    const t = createTranslator("en");
    expect(formatEta(t, 45)).toBe("~45 s");
    expect(formatEta(t, 600)).toBe("~10 min");
    expect(formatEta(t, null)).toBeNull();
  });
});

describe("methodCopy", () => {
  const ru = createTranslator("ru");
  const en = createTranslator("en");
  const sbp = { rail: "ru", methodId: "sbp", label: "SBP", subtitle: "Fast payments" };

  it("translates known rail methods into the UI language whatever the backend sent", () => {
    expect(methodCopy(ru, sbp)).toEqual({ label: "СБП", subtitle: "Любой банк" });
    expect(methodCopy(en, { rail: "ua", methodId: "p2p", label: "Переказ на картку", subtitle: "Будь-який банк" })).toEqual({
      label: "Card transfer (P2P)",
      subtitle: "Any bank",
    });
    expect(methodCopy(ru, { rail: "in", methodId: "upi", label: "UPI", subtitle: "Any UPI app" }).subtitle).toBe(
      "Любое UPI-приложение",
    );
  });

  it("keeps the backend copy for methods the SDK does not know", () => {
    expect(methodCopy(ru, { rail: "ru", methodId: "sberbank", label: "Оплата с Сбербанка", subtitle: "СБП" })).toEqual({
      label: "Оплата с Сбербанка",
      subtitle: "СБП",
    });
    expect(methodCopy(ru, { rail: "ua", methodId: "default", label: null, subtitle: null })).toEqual({
      label: null,
      subtitle: null,
    });
  });

  it("lets the broker override a method label through messages", () => {
    const t = createTranslator("ru", { "method.ru.sbp": "Система быстрых платежей" });
    expect(methodCopy(t, sbp).label).toBe("Система быстрых платежей");
  });
});
