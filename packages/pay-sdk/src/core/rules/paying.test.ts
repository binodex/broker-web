import { describe, expect, it } from "vitest";
import { serverClockOffsetMs } from "../clock.js";
import type { FiatDeposit, Requisites } from "../types.js";
import {
  COUNTDOWN_MAX_MS,
  formatExpires,
  payToLabelKey,
  showsCountdown,
  statusTone,
} from "./paying.js";
import { getPayView, requisitesOf, shownPayStatus, type PayFields } from "./requisites.js";

const PAYWALL = "https://pay.upay.invalid/in/checkout/7f3a";
const QR = "https://pay.upay.invalid/in/qr/7f3a.png";

const UPI: Requisites = {
  kind: "upi",
  value: "merchant.test@okaxis",
  amount: "1003",
  recipientName: "Test Payee",
  bank: "Axis Bank",
  country: null,
};

const upiDeposit = (over: Partial<FiatDeposit> = {}, requisites: Partial<Requisites> | null = {}): PayFields => ({
  status: "pending",
  amount: "1000.00",
  expiresAt: Date.now() + 15 * 60_000,
  nextAction: requisites === null ? null : { type: "show_requisites", requisites: { ...UPI, ...requisites }, frame: null },
  ...over,
});

const PAST = Date.now() - 1_000;

const requisitesOfDeposit = (dep: PayFields) =>
  dep.nextAction?.type === "show_requisites" ? requisitesOf(dep.nextAction.requisites, dep.amount ?? "") : null;

describe("India paying view", () => {
  it("pay_to present: requisites in place, the UPI ID as is", () => {
    const dep = upiDeposit();
    expect(getPayView(dep).kind).toBe("requisites");
    const r = requisitesOfDeposit(dep)!;
    expect(r.kind).toBe("upi");
    expect(r.display).toBe("merchant.test@okaxis");
    expect(r.copyValue).toBe("merchant.test@okaxis");
  });

  it("only a paywall: a tab; only a QR: the QR; nothing: none", () => {
    expect(getPayView(upiDeposit({ nextAction: { type: "redirect", url: PAYWALL } }))).toEqual({ kind: "redirect", url: PAYWALL });
    expect(getPayView(upiDeposit({ nextAction: { type: "qr", payload: null, imageUrl: QR } }))).toEqual({
      kind: "qr",
      payload: null,
      imageUrl: QR,
    });
    expect(getPayView(upiDeposit({ nextAction: undefined }))).toEqual({ kind: "none" });
  });

  it("a poll without the key keeps the shown requisites until the deadline", () => {
    const known = requisitesOfDeposit(upiDeposit())!;
    expect(getPayView(upiDeposit({ nextAction: undefined }), known)).toEqual({ kind: "requisites", requisites: known });
  });

  it("requisites withdrawn by paymeta close at once", () => {
    const known = requisitesOfDeposit(upiDeposit())!;
    expect(getPayView(upiDeposit({ nextAction: null }), known)).toEqual({ kind: "closed" });
  });

  it("a non-pending deposit is closed", () => {
    const known = requisitesOfDeposit(upiDeposit())!;
    for (const status of ["completed", "failed", "expired"] as const) {
      expect(getPayView(upiDeposit({ status, nextAction: undefined }), known)).toEqual({ kind: "closed" });
      expect(getPayView(upiDeposit({ status }), known).kind).toBe("closed");
    }
  });

  it("the deadline runs on the paymeta clock", () => {
    const created = Date.parse("2026-10-16T12:00:00.000Z");
    const receivedOnDevice = created + 20 * 60_000 + 300;
    const offset = serverClockOffsetMs(created, receivedOnDevice);
    const dep = upiDeposit({ expiresAt: created + 15 * 60_000 });
    const deviceNow = receivedOnDevice + 30_000;
    expect(getPayView(dep, null, deviceNow).kind).toBe("closed");
    expect(getPayView(dep, null, deviceNow + offset).kind).toBe("requisites");
    expect(getPayView(dep, null, created + 15 * 60_000).kind).toBe("closed");
  });

  it("the amount is the provider price, the requested one only as a fallback", () => {
    const r = requisitesOfDeposit(upiDeposit())!;
    expect(r.amount).toBe("1003");
    expect(r.amountCopy).toBe("1003");
    expect(requisitesOfDeposit(upiDeposit({}, { amount: "1003.50" }))!.amountCopy).toBe("1003.50");
    const half = requisitesOfDeposit(upiDeposit({}, { amount: "" }))!;
    expect(half.amount).toBe("1000.00");
    expect(half.amountCopy).toBe("1000");
  });

  it("spaces are trimmed, cards are grouped, unknown kinds are accounts", () => {
    const spaced = requisitesOfDeposit(upiDeposit({}, { value: " merchant.test@okaxis " }))!;
    expect(spaced.display).toBe("merchant.test@okaxis");
    expect(spaced.copyValue).toBe("merchant.test@okaxis");
    const card = requisitesOfDeposit(upiDeposit({}, { value: "4111111111111111", kind: "card" }))!;
    expect(card.display).toBe("4111 1111 1111 1111");
    expect(card.copyValue).toBe("4111111111111111");
    const unknown = requisitesOfDeposit(upiDeposit({}, { value: "50100123456789", kind: "imps" }))!;
    expect(unknown.kind).toBe("account");
    expect(unknown.display).toBe("50100123456789");
  });

  it("recipient fields are separate and blanks count as missing", () => {
    const r = requisitesOfDeposit(upiDeposit())!;
    expect(r.bank).toBe("Axis Bank");
    expect(r.recipient).toBe("Test Payee");
    expect(r.country).toBeNull();
    const bare = requisitesOfDeposit(upiDeposit({}, { recipientName: "", bank: null }))!;
    expect(bare.recipient).toBeNull();
    expect(bare.bank).toBeNull();
    expect(requisitesOfDeposit(upiDeposit({}, { value: "  " }))).toBeNull();
  });

  it("closed requisites read as expired unless the deposit is already credited", () => {
    const known = requisitesOfDeposit(upiDeposit())!;
    const closed = getPayView(upiDeposit({ expiresAt: PAST }), known);
    expect(closed).toEqual({ kind: "closed" });
    expect(shownPayStatus({ status: "pending", creditedUsd: null }, closed)).toBe("expired");
    expect(shownPayStatus({ status: "pending", creditedUsd: "12.00" }, closed)).toBe("pending");
    const paywall = getPayView(upiDeposit({ nextAction: { type: "redirect", url: PAYWALL }, expiresAt: PAST }));
    expect(paywall.kind).toBe("redirect");
    expect(shownPayStatus({ status: "pending", creditedUsd: null }, paywall)).toBe("pending");
  });
});

describe("paying screen helpers", () => {
  it("maps provider statuses to three tones", () => {
    expect(statusTone("completed")).toBe("completed");
    expect(statusTone("credited")).toBe("completed");
    expect(statusTone("success")).toBe("completed");
    expect(statusTone("failed")).toBe("failed");
    expect(statusTone("expired")).toBe("failed");
    expect(statusTone("pending")).toBe("pending");
    expect(statusTone("disputed")).toBe("pending");
  });

  it("shows a countdown only for short windows", () => {
    const now = Date.parse("2026-10-16T12:00:00.000Z");
    expect(showsCountdown(now + 15 * 60_000, now)).toBe(true);
    expect(showsCountdown(new Date(now + COUNTDOWN_MAX_MS).toISOString(), now)).toBe(true);
    expect(showsCountdown(now + 24 * 60 * 60_000, now)).toBe(false);
    expect(showsCountdown(null, now)).toBe(false);
  });

  it("formats the remaining time as mm:ss and never below zero", () => {
    const now = Date.parse("2026-10-16T12:00:00.000Z");
    expect(formatExpires(now + 14 * 60_000 + 59_500, now)).toBe("14:59");
    expect(formatExpires(new Date(now + 65_000).toISOString(), now)).toBe("01:05");
    expect(formatExpires(now - 1, now)).toBe("00:00");
    expect(formatExpires(null, now)).toBe("00:00");
  });

  it("labels the receiver by kind", () => {
    expect(payToLabelKey("upi")).toBe("fiat.payToUpi");
    expect(payToLabelKey("card")).toBe("fiat.payToCard");
    expect(payToLabelKey("phone")).toBe("fiat.payToPhone");
    expect(payToLabelKey("account")).toBe("fiat.payToAccount");
  });
});
