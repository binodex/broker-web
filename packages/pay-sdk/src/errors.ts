import type { PayError, PayErrorCode } from "./types.js";

export class PaySdkError extends Error {
  readonly code: PayErrorCode;

  constructor(code: PayErrorCode, message: string) {
    super(message);
    this.name = "PaySdkError";
    this.code = code;
  }
}

export const SESSION_FAILED_MESSAGE = "Could not create widget session";

export const toPayError = (error: unknown): PayError =>
  error instanceof PaySdkError
    ? { code: error.code, message: error.message }
    : { code: "session_failed", message: SESSION_FAILED_MESSAGE };
