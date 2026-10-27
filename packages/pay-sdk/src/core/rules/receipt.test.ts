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

  it("needs both the provider and the method", () => {
    expect(getRuReceiptRule(null, "sbp")).toBeNull();
    expect(getRuReceiptRule("paayzen", undefined)).toBeNull();
  });
});
