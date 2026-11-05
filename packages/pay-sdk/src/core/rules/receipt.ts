export interface ReceiptRule {
  pdfOnly: boolean;
}

const RECEIPT_RULES: Record<string, Record<string, ReceiptRule>> = {
  paayzen: {
    sbp: { pdfOnly: false },
    c2c: { pdfOnly: false },
  },
  paylee: {
    any_qr: { pdfOnly: true },
    alfa_transgran: { pdfOnly: true },
    alfa: { pdfOnly: true },
  },
  // The picker cards are `c2c` and `sbp`, the deposit rows carry the rail, `card` and `phone`; both must hit the same rule.
  meridianpay: {
    c2c: { pdfOnly: true },
    sbp: { pdfOnly: true },
    card: { pdfOnly: true },
    phone: { pdfOnly: true },
  },
};

// Paylee stores the rail as `any-qr` while the picker card id is `any_qr`; both must hit the same rule.
const normalizeMethodKey = (methodId: string): string => methodId.replace(/-/g, "_");

export const getRuReceiptRule = (
  provider: string | null | undefined,
  methodId: string | null | undefined,
): ReceiptRule | null => {
  if (!provider || !methodId) return null;
  return RECEIPT_RULES[provider]?.[normalizeMethodKey(methodId)] ?? null;
};

export const requiresRuReceipt = (
  provider: string | null | undefined,
  methodId: string | null | undefined,
): boolean => getRuReceiptRule(provider, methodId) !== null;

export const getRuReceiptRuleForMethod = (
  methodId: string,
  providerOptions: readonly string[] | null | undefined,
): ReceiptRule | null => {
  if (!providerOptions || providerOptions.length === 0) return null;
  let agreed: ReceiptRule | null = null;
  for (const provider of providerOptions) {
    const rule = getRuReceiptRule(provider, methodId);
    if (!rule) return null;
    if (agreed && agreed.pdfOnly !== rule.pdfOnly) return null;
    agreed = rule;
  }
  return agreed;
};
