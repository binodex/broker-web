export type PayMode = "deposit" | "withdraw";

export type PayTheme = "light" | "dark";

export type PayStatus =
  | "idle"
  | "session"
  | "loading"
  | "handshake"
  | "ready"
  | "error";

export type PayErrorCode =
  | "session_failed"
  | "invalid_widget_url"
  | "widget_error";

export interface PayError {
  code: PayErrorCode;
  message: string;
  reason?: string;
}

export interface CreditedEvent {
  amount: number;
  asset: string;
}

export interface WidgetSession {
  session: string;
  expires_in?: number;
  widget_url?: string;
  widget_origin?: string;
  region?: string;
}

export interface CreateSessionContext {
  mode: PayMode;
  signal: AbortSignal;
}

export type CreateSession = (
  context: CreateSessionContext,
) => Promise<WidgetSession>;

export type PayPart = "frame" | "trigger" | "close" | "loader" | "status";

interface PayWidgetBaseOptions {
  mode: PayMode;
  clientId?: string;
  platformUrl?: string;
  lang?: string;
  theme?: PayTheme;
  requireChannel?: boolean;
}

export type PayWidgetOptions = PayWidgetBaseOptions &
  (
    | { sessionEndpoint: string; createSession?: undefined }
    | { createSession: CreateSession; sessionEndpoint?: undefined }
  );

export interface FrameOptions {
  title?: string;
  initialHeight?: number;
  minHeight?: number;
  maxHeight?: number;
}
