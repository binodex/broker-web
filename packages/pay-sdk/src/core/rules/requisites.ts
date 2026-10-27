import type {
  FiatDeposit,
  FiatDepositStatus,
  Requisites,
  RequisitesFrameRef,
} from "../types.js";

export type RequisitesKind = "card" | "phone" | "account" | "upi";

const KINDS: readonly RequisitesKind[] = ["card", "phone", "account", "upi"];

export interface RequisitesView {
  kind: RequisitesKind;
  display: string;
  copyValue: string;
  amount: string;
  amountCopy: string;
  bank: string | null;
  recipient: string | null;
  country: string | null;
}

export type PayView =
  | { kind: "requisites"; requisites: RequisitesView }
  | { kind: "frame"; frame: RequisitesFrameRef | null }
  | { kind: "redirect"; url: string }
  | { kind: "qr"; payload: string | null; imageUrl: string | null }
  | { kind: "closed" }
  | { kind: "none" };

const text = (value: string | null | undefined): string | null => {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
};

export const groupCardNumber = (value: string): string =>
  value.replace(/\s+/g, "").replace(/(\d{4})(?=\d)/g, "$1 ");

export const amountForCopy = (value: string): string => {
  const num = Number(value);
  if (!Number.isFinite(num)) return value.replace(/\s+/g, "");
  return Number.isInteger(num) ? String(num) : num.toFixed(2);
};

const deadlinePassed = (expiresAt: number | null, nowMs: number): boolean =>
  expiresAt !== null && Number.isFinite(expiresAt) && expiresAt <= nowMs;

export const requisitesOf = (
  requisites: Requisites | null | undefined,
  requestedAmount: string,
): RequisitesView | null => {
  if (!requisites) return null;
  const payTo = text(requisites.value);
  if (!payTo) return null;
  const kind = KINDS.find((entry) => entry === requisites.kind) ?? "account";
  const amount = text(requisites.amount) ?? requestedAmount;
  return {
    kind,
    display: kind === "card" ? groupCardNumber(payTo) : payTo,
    copyValue: payTo.replace(/\s+/g, ""),
    amount,
    amountCopy: amountForCopy(amount),
    bank: text(requisites.bank),
    recipient: text(requisites.recipientName),
    country: text(requisites.country),
  };
};

export type PayFields = Pick<
  FiatDeposit,
  "status" | "amount" | "expiresAt" | "nextAction"
>;

export const freshRequisitesOf = (deposit: PayFields): RequisitesView | null =>
  deposit.nextAction?.type === "show_requisites"
    ? requisitesOf(deposit.nextAction.requisites, deposit.amount ?? "")
    : null;

const isWithdrawn = (deposit: PayFields): boolean =>
  deposit.nextAction === null ||
  (deposit.nextAction?.type === "show_requisites" &&
    deposit.nextAction.requisites === null &&
    deposit.nextAction.frame === null);

export const getPayView = (
  deposit: PayFields,
  known: RequisitesView | null = null,
  nowMs: number = Date.now(),
): PayView => {
  const fresh = freshRequisitesOf(deposit);
  const shown = fresh ?? known;
  const payable =
    deposit.status === "pending" && !deadlinePassed(deposit.expiresAt, nowMs);
  if (shown) {
    const withdrawn = fresh === null && isWithdrawn(deposit);
    return payable && !withdrawn
      ? { kind: "requisites", requisites: shown }
      : { kind: "closed" };
  }
  const action = deposit.nextAction;
  if (action?.type === "show_requisites" && action.frame) {
    return payable ? { kind: "frame", frame: action.frame } : { kind: "closed" };
  }
  if (action?.type === "redirect") return { kind: "redirect", url: action.url };
  if (action?.type === "qr") {
    return { kind: "qr", payload: action.payload, imageUrl: action.imageUrl };
  }
  return { kind: "none" };
};

export const shownPayStatus = (
  deposit: { status: FiatDepositStatus; creditedUsd?: string | null },
  view: PayView,
): FiatDepositStatus =>
  deposit.status === "pending" && !deposit.creditedUsd && view.kind === "closed"
    ? "expired"
    : deposit.status;

export const isTerminalDepositStatus = (status: FiatDepositStatus): boolean =>
  status === "completed" || status === "failed" || status === "expired";

export const redirectAfterCreate = (deposit: PayFields): string | null => {
  const view = getPayView(deposit);
  return view.kind === "redirect" ? view.url : null;
};
