import { describe, expect, it } from "vitest";
import { getRuReceiptRule, getRuReceiptRuleForMethod, requiresRuReceipt } from "./receipt.js";

describe("receipt rules", () => {
  it("Alfa Transgran takes a PDF receipt by the picker card and by the deposit rail", () => {
    expect(getRuReceiptRuleForMethod("alfa_transgran", ["paylee"])).toEqual({ pdfOnly: true });
    expect(getRuReceiptRule("paylee", "alfa")).toEqual({ pdfOnly: true });
  });

  it("the hyphenated any-qr rail finds the same rule as the any_qr card", () => {
    expect(getRuReceiptRule("paylee", "any-qr")).toEqual({ pdfOnly: true });
    expect(getRuReceiptRuleForMethod("any_qr", ["paylee"])).toEqual({ pdfOnly: true });
  });

  it("the receipt belongs to the provider and rail pair", () => {
    expect(requiresRuReceipt("paayzen", "alfa")).toBe(false);
    expect(requiresRuReceipt("paylee", "trans")).toBe(false);
    expect(requiresRuReceipt("paylee", "alfa-qr")).toBe(false);
  });

  it("Paayzen accepts images too", () => {
    expect(getRuReceiptRule("paayzen", "sbp")).toEqual({ pdfOnly: false });
    expect(getRuReceiptRule("paayzen", "c2c")).toEqual({ pdfOnly: false });
  });

  it("a cascading rail is unknown before create", () => {
    expect(getRuReceiptRuleForMethod("sbp", ["paayzen", "nirvanapay"])).toBeNull();
    expect(getRuReceiptRuleForMethod("sbp", ["paayzen"])).toEqual({ pdfOnly: false });
    expect(getRuReceiptRuleForMethod("sbp", [])).toBeNull();
    expect(getRuReceiptRuleForMethod("sbp", null)).toBeNull();
  });

  it("MeridianPay takes a PDF receipt by the deposit rail and by the picker card", () => {
    expect(getRuReceiptRule("meridianpay", "card")).toEqual({ pdfOnly: true });
    expect(getRuReceiptRule("meridianpay", "phone")).toEqual({ pdfOnly: true });
    expect(getRuReceiptRuleForMethod("c2c", ["meridianpay"])).toEqual({ pdfOnly: true });
    expect(getRuReceiptRuleForMethod("sbp", ["meridianpay"])).toEqual({ pdfOnly: true });
  });

  it("a card rail takes a receipt only with MeridianPay", () => {
    expect(requiresRuReceipt("paylee", "card")).toBe(false);
    expect(requiresRuReceipt("paayzen", "phone")).toBe(false);
  });

  it("a rail shared with Paayzen is not known to be PDF only before create", () => {
    expect(getRuReceiptRuleForMethod("sbp", ["paayzen", "meridianpay"])).toBeNull();
    expect(getRuReceiptRuleForMethod("c2c", ["meridianpay", "paayzen"])).toBeNull();
  });

  it("Sakura BT PDF takes a PDF receipt by the deposit rail and by the picker card", () => {
    expect(getRuReceiptRule("sakura", "card@bt")).toEqual({ pdfOnly: true });
    expect(getRuReceiptRule("sakura", "phone@bt")).toEqual({ pdfOnly: true });
    expect(getRuReceiptRuleForMethod("c2c", ["sakura"])).toEqual({ pdfOnly: true });
    expect(getRuReceiptRuleForMethod("sbp", ["sakura"])).toEqual({ pdfOnly: true });
  });

  it("MeridianPay and Sakura together keep the PDF receipt on the picker card", () => {
    expect(getRuReceiptRuleForMethod("c2c", ["meridianpay", "sakura"])).toEqual({ pdfOnly: true });
    expect(getRuReceiptRuleForMethod("sbp", ["sakura", "meridianpay"])).toEqual({ pdfOnly: true });
  });

  it("other Sakura rails take no receipt", () => {
    expect(requiresRuReceipt("sakura", "card@psb")).toBe(false);
    expect(requiresRuReceipt("sakura", "phone@tj")).toBe(false);
    expect(getRuReceiptRuleForMethod("psb", ["sakura"])).toBeNull();
    expect(getRuReceiptRuleForMethod("trans_phone", ["sakura"])).toBeNull();
  });

  it("needs both the provider and the method", () => {
    expect(getRuReceiptRule(null, "sbp")).toBeNull();
    expect(getRuReceiptRule("paayzen", undefined)).toBeNull();
  });
});
