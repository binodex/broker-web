import { describe, expect, it } from "vitest";
import { serverClockOffsetMs } from "../clock.js";
import type { FiatDeposit, NextAction, Requisites, RequisitesFrameRef } from "../types.js";
import {
  getPayView,
  groupCardNumber,
  redirectAfterCreate,
  requisitesOf,
  shownPayStatus,
  type PayFields,
} from "./requisites.js";

const PAYWALL = "https://api.binodex.invalid/v1/ru-deposits/paylee-paywall/1525808";
const QR_PAYLOAD = "https://qr.nspk.ru/AS1000670LSS7DN18SJQDNP4B05KLJL2";

const CARD: Requisites = {
  kind: "card",
  value: "9762000011115616",
  amount: "22227",
  recipientName: "Karimov Daler",
  bank: "Dushanbe City Bank",
  country: "Tajikistan",
};

const UPI: Requisites = {
  kind: "upi",
  value: "merchant.test@okaxis",
  amount: "1003",
  recipientName: "Test Payee",
  bank: "Axis Bank",
  country: null,
};

const show = (requisites: Requisites | null, frame: RequisitesFrameRef | null = null): NextAction => ({
  type: "show_requisites",
  requisites,
  frame,
});

const deposit = (over: Partial<FiatDeposit> = {}): PayFields => ({
  status: "pending",
  amount: "22222.00",
  expiresAt: Date.now() + 15 * 60_000,
  nextAction: show(CARD),
  ...over,
});

const PAST = Date.now() - 1_000;

describe("requisites rules: what the payer pays with", () => {
  it("requisites in the answer: shown in place, no tab is opened", () => {
    const view = getPayView(deposit());
    expect(view.kind).toBe("requisites");
    expect(redirectAfterCreate(deposit())).toBeNull();
  });

  it("only a redirect: a tab, as before", () => {
    const dep = deposit({ nextAction: { type: "redirect", url: PAYWALL } });
    expect(getPayView(dep)).toEqual({ kind: "redirect", url: PAYWALL });
    expect(redirectAfterCreate(dep)).toBe(PAYWALL);
  });

  it("only a QR: rendered in place, no tab", () => {
    const dep = deposit({ nextAction: { type: "qr", payload: QR_PAYLOAD, imageUrl: null } });
    expect(getPayView(dep)).toEqual({ kind: "qr", payload: QR_PAYLOAD, imageUrl: null });
    expect(redirectAfterCreate(dep)).toBeNull();
  });

  it("frame delivery: the frame stands in for raw requisites while payable", () => {
    const frame = { origins: ["https://binodex.test"], path: "/embed/pay/requisites" };
    expect(getPayView(deposit({ nextAction: show(null, frame) }))).toEqual({ kind: "frame", frame });
    expect(getPayView(deposit({ nextAction: show(null, frame), expiresAt: PAST })).kind).toBe("closed");
    expect(getPayView(deposit({ nextAction: show(null, frame), status: "completed" })).kind).toBe("closed");
  });

  it("nothing to pay with: none", () => {
    expect(getPayView(deposit({ nextAction: null }))).toEqual({ kind: "none" });
  });

  it("a poll without next_action keeps the known requisites until the deadline", () => {
    const known = requisitesOf(CARD, "22222.00");
    const polled = deposit({ nextAction: undefined });
    expect(getPayView(polled, known)).toEqual({ kind: "requisites", requisites: known });
  });

  it("next_action: null means the requisites were withdrawn: closed at once", () => {
    const known = requisitesOf(CARD, "22222.00");
    expect(getPayView(deposit({ nextAction: null }), known)).toEqual({ kind: "closed" });
    expect(getPayView(deposit({ nextAction: show(null) }), known)).toEqual({ kind: "closed" });
  });

  it("past pending: closed, even when the answer still carries requisites", () => {
    const known = requisitesOf(CARD, "22222.00");
    for (const status of ["completed", "failed", "expired"] as const) {
      expect(getPayView(deposit({ status, nextAction: undefined }), known)).toEqual({ kind: "closed" });
      expect(getPayView(deposit({ status }), known).kind).toBe("closed");
    }
  });

  it("a device clock 20 minutes fast: the deadline is read on the server clock", () => {
    const created = Date.parse("2026-09-19T12:00:00.000Z");
    const receivedOnDevice = created + 20 * 60_000 + 300;
    const offset = serverClockOffsetMs(created, receivedOnDevice);
    expect(offset).toBe(-(20 * 60_000 + 300));
    const dep = deposit({ expiresAt: created + 15 * 60_000 });
    const deviceNow = receivedOnDevice + 30_000;
    expect(getPayView(dep, null, deviceNow).kind).toBe("closed");
    expect(getPayView(dep, null, deviceNow + offset).kind).toBe("requisites");
    expect(getPayView(dep, null, created + 15 * 60_000).kind).toBe("closed");
    expect(serverClockOffsetMs(undefined, receivedOnDevice)).toBe(0);
    expect(serverClockOffsetMs(Number.NaN, receivedOnDevice)).toBe(0);
  });

  it("deadline passed: closed, not a tab with the same card", () => {
    const known = requisitesOf(CARD, "22222.00");
    expect(getPayView(deposit({ nextAction: null, expiresAt: PAST }), known)).toEqual({ kind: "closed" });
    expect(getPayView(deposit({ expiresAt: PAST })).kind).toBe("closed");
    expect(redirectAfterCreate(deposit({ expiresAt: PAST }))).toBeNull();
    expect(
      getPayView(deposit({ nextAction: { type: "redirect", url: PAYWALL }, expiresAt: PAST })).kind,
    ).toBe("redirect");
  });

  it("card numbers are grouped by four and copied without spaces", () => {
    const view = requisitesOf(CARD, "1");
    expect(view?.display).toBe("9762 0000 1111 5616");
    expect(view?.copyValue).toBe("9762000011115616");
    expect(requisitesOf({ ...CARD, value: "9762 0000 1111 5616" }, "1")?.copyValue).toBe("9762000011115616");
    expect(groupCardNumber("2200000000000000123")).toBe("2200 0000 0000 0000 123");
  });

  it("phones and UPI ids are shown as issued and copied without spaces", () => {
    const phone = requisitesOf({ ...CARD, kind: "phone", value: "+7 111 111 11 11" }, "1");
    expect(phone?.display).toBe("+7 111 111 11 11");
    expect(phone?.copyValue).toBe("+71111111111");
    const upi = requisitesOf({ ...UPI, value: " merchant.test@okaxis " }, "1");
    expect(upi?.kind).toBe("upi");
    expect(upi?.display).toBe("merchant.test@okaxis");
    expect(upi?.copyValue).toBe("merchant.test@okaxis");
  });

  it("unknown kinds are drawn as an account", () => {
    const view = requisitesOf({ ...CARD, kind: "iban", value: "TJ12 3456" }, "1");
    expect(view?.kind).toBe("account");
    expect(view?.display).toBe("TJ12 3456");
  });

  it("the amount is the provider's amount, the requested one only as a fallback", () => {
    expect(requisitesOf(CARD, "22222.00")?.amount).toBe("22227");
    expect(requisitesOf({ ...CARD, amount: "5007.50" }, "1")?.amountCopy).toBe("5007.50");
    const half = requisitesOf({ ...CARD, amount: "" }, "22222.00");
    expect(half?.amount).toBe("22222.00");
    expect(half?.amountCopy).toBe("22222");
    expect(requisitesOf(UPI, "1000.00")?.amountCopy).toBe("1003");
  });

  it("recipient fields are separate; blank strings read as absent", () => {
    const view = requisitesOf(CARD, "1");
    expect(view?.bank).toBe("Dushanbe City Bank");
    expect(view?.recipient).toBe("Karimov Daler");
    expect(view?.country).toBe("Tajikistan");
    const bare = requisitesOf({ ...CARD, recipientName: "", country: null }, "1");
    expect(bare?.recipient).toBeNull();
    expect(bare?.country).toBeNull();
    expect(requisitesOf({ ...CARD, value: "  " }, "1")).toBeNull();
  });

  it("retired requisites read as expired at once; a credited deposit never does", () => {
    const known = requisitesOf(CARD, "22222.00");
    const pending = { status: "pending" as const, creditedUsd: null };
    const closed = getPayView(deposit({ expiresAt: PAST }), known);
    expect(closed).toEqual({ kind: "closed" });
    expect(shownPayStatus(pending, closed)).toBe("expired");
    expect(shownPayStatus(pending, getPayView(deposit({ nextAction: null }), known))).toBe("expired");
    expect(shownPayStatus(pending, getPayView(deposit(), known))).toBe("pending");
    expect(shownPayStatus({ status: "pending", creditedUsd: "51.20" }, closed)).toBe("pending");
    for (const status of ["completed", "failed", "expired"] as const) {
      expect(shownPayStatus({ status, creditedUsd: null }, closed)).toBe(status);
    }
  });

  it("provider pages and QR codes do not expire on our deadline", () => {
    const pending = { status: "pending" as const, creditedUsd: null };
    const redirect = getPayView(deposit({ nextAction: { type: "redirect", url: PAYWALL }, expiresAt: PAST }));
    expect(redirect.kind).toBe("redirect");
    expect(shownPayStatus(pending, redirect)).toBe("pending");
    const qr = getPayView(
      deposit({ nextAction: { type: "qr", payload: QR_PAYLOAD, imageUrl: null }, expiresAt: PAST }),
    );
    expect(qr.kind).toBe("qr");
    expect(shownPayStatus(pending, qr)).toBe("pending");
  });
});
