import type { PayErrorCode } from "./errors.js";
import type {
  CryptoDepositStatus,
  DepositSource,
  DisplayStatus,
  FiatDepositStatus,
  WithdrawalStatus,
} from "./types.js";

interface EventBase {
  at: number;
  source: "client";
}

export type PayEvent = EventBase &
  (
    | { type: "session.ready"; renewed: boolean }
    | { type: "session.expired" }
    | { type: "method.selected"; methodId: string }
    | {
        type: "deposit.created";
        depositId: string;
        kind: "crypto" | "fiat";
        methodId: string;
      }
    | {
        type: "deposit.status";
        depositId: string;
        status: CryptoDepositStatus | FiatDepositStatus;
      }
    | {
        type: "deposit.credited";
        paymentId: number;
        amountUsd: string | null;
        depositSource: DepositSource;
        creditedAt: number;
      }
    | { type: "withdrawal.created"; withdrawalId: string }
    | {
        type: "withdrawal.status";
        withdrawalId: string;
        status: WithdrawalStatus;
        displayStatus: DisplayStatus;
        paymentId?: number;
      }
    | { type: "close.requested" }
    | { type: "error"; code: PayErrorCode; scope: string }
  );

export type PayEventType = PayEvent["type"];

type DistributiveOmit<T, K extends keyof never> = T extends unknown
  ? Omit<T, K>
  : never;

export type PayEventInput = DistributiveOmit<PayEvent, "at" | "source">;

export const createEvent = (input: PayEventInput, at = Date.now()): PayEvent =>
  ({ ...input, at, source: "client" }) as PayEvent;
