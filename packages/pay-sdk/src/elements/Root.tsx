"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import * as Legacy from "../react.js";
import { resolveSkin, resolveTheme, themeVariables, type Appearance } from "../core/appearance.js";
import { createPayClient } from "../core/client.js";
import { FALLBACK_CODES } from "../core/errors.js";
import type { PayEvent } from "../core/events.js";
import { createDepositFlow, type DepositFlow } from "../core/flows/deposit.js";
import { createWithdrawFlow, type WithdrawFlow } from "../core/flows/withdraw.js";
import {
  createTranslator,
  intlLocale,
  isRtlLocale,
  resolveLocale,
  type MessageKey,
} from "../core/i18n/index.js";
import { createStore } from "../core/store.js";
import type {
  CreateSession,
  CryptoDeposit,
  PayContext,
  PayMode,
  PayTheme,
} from "../core/types.js";
import { PayUiValueProvider, usePayUiValue } from "../ui/context.js";
import { registerFontFaces } from "../ui/fonts.js";
import { PayRootContext, useStoreValue, type PayRootValue, type PickerState } from "./context.js";
import { cx } from "./part.js";

const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export type PayFallback = "iframe" | "error";

interface RootBaseProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "children" | "dir" | "lang"> {
  mode: PayMode;
  clientId?: string;
  allowedApiOrigins?: readonly string[];
  allowedWidgetOrigins?: readonly string[];
  apiBase?: string;
  locale?: string;
  messages?: Partial<Record<MessageKey, string>>;
  appearance?: Appearance;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  onEvent?: (event: PayEvent) => void;
  fallback?: PayFallback;
  platformUrl?: string;
  returnUrl?: string;
  unstyled?: boolean;
  assetBaseUrl?: string;
  fontBaseUrl?: string | false;
  fetch?: typeof fetch;
  children?: ReactNode;
}

export type RootProps = RootBaseProps &
  (
    | { sessionEndpoint: string; createSession?: undefined }
    | { createSession: CreateSession; sessionEndpoint?: undefined }
  );

const legacyTheme = (theme: string): PayTheme | undefined =>
  theme === "light" || theme === "dark" ? theme : undefined;

export const Root = forwardRef<HTMLDivElement, RootProps>(function Root(props, ref) {
  const {
    mode,
    clientId,
    allowedApiOrigins,
    allowedWidgetOrigins,
    apiBase,
    locale: localeProp,
    messages,
    appearance,
    open: openProp,
    defaultOpen = true,
    onOpenChange,
    onEvent,
    fallback = "error",
    platformUrl,
    returnUrl,
    unstyled = false,
    assetBaseUrl,
    fontBaseUrl,
    fetch: fetchProp,
    sessionEndpoint,
    createSession: createSessionProp,
    children,
    className,
    style,
    ...rest
  } = props;
  const latest = useRef(props);
  useIsomorphicLayoutEffect(() => {
    latest.current = props;
  });
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const open = openProp ?? uncontrolledOpen;
  const [generation, setGeneration] = useState(0);
  const hasCreateSession = typeof createSessionProp === "function";
  const allowedApiKey = allowedApiOrigins?.join(" ") ?? null;
  const allowedWidgetKey = allowedWidgetOrigins?.join(" ") ?? null;
  const locale = useMemo(() => resolveLocale(localeProp), [localeProp]);

  const setOpen = useCallback((next: boolean) => {
    if (latest.current.open === undefined) setUncontrolledOpen(next);
    latest.current.onOpenChange?.(next);
  }, []);

  const createSession = useCallback<CreateSession>((context) => {
    const source = latest.current.createSession;
    return source
      ? source(context)
      : Promise.reject(new Error("createSession is no longer provided"));
  }, []);

  const client = useMemo(
    () =>
      createPayClient({
        mode,
        ...(hasCreateSession ? { createSession } : { sessionEndpoint }),
        clientId,
        allowedApiOrigins: allowedApiKey === null ? undefined : allowedApiKey.split(" ").filter(Boolean),
        allowedWidgetOrigins:
          allowedWidgetKey === null ? undefined : allowedWidgetKey.split(" ").filter(Boolean),
        apiBase,
        locale,
        fetch: fetchProp,
        onEvent: (event) => latest.current.onEvent?.(event),
      }),
    [
      mode,
      hasCreateSession,
      createSession,
      sessionEndpoint,
      clientId,
      allowedApiKey,
      allowedWidgetKey,
      apiBase,
      locale,
      fetchProp,
      generation,
    ],
  );

  const flow = useMemo<DepositFlow | WithdrawFlow>(
    () =>
      mode === "deposit"
        ? createDepositFlow(client, { returnUrl, onrampTheme: legacyTheme(appearance?.theme ?? "") })
        : createWithdrawFlow(client),
    [client, mode],
  );

  const picker = useMemo(
    () => createStore<PickerState>({ cryptoOpen: false, cryptoCurrency: null, tab: null, country: null, fiatMethodId: null }),
    [flow],
  );
  const cryptoCache = useMemo(() => new Map<string, CryptoDeposit>(), [client]);

  useEffect(() => {
    if (!open) return;
    const release = client.retain();
    flow.actions.start();
    return () => {
      release();
      setTimeout(() => {
        if (client.destroyed) flow.actions.destroy();
      }, 0);
    };
  }, [client, flow, open]);

  const wasOpen = useRef(open);
  useEffect(() => {
    if (wasOpen.current && !open) setGeneration((value) => value + 1);
    wasOpen.current = open;
  }, [open]);

  const restart = useCallback(() => setGeneration((value) => value + 1), []);

  const clientState = useStoreValue(client.state);
  const flowState = useStoreValue<{ context: PayContext | null }>(flow);
  const branding = flowState.context?.branding ?? null;
  const theme = resolveTheme(appearance, branding);
  const skin = resolveSkin(appearance);
  const variables = useMemo(
    () => themeVariables(branding, appearance),
    [branding, appearance],
  );
  const messagesKey = JSON.stringify(messages ?? {});
  const t = useMemo(
    () => createTranslator(locale, JSON.parse(messagesKey) as Partial<Record<MessageKey, string>>),
    [locale, messagesKey],
  );
  const dir = isRtlLocale(locale) ? "rtl" : "ltr";
  const lastReachable = useRef("");
  if (clientState.status === "ready") lastReachable.current = client.widgetOrigins().join(" ") || lastReachable.current;
  const reachableKey = lastReachable.current;
  const reachable = useMemo(() => reachableKey.split(" ").filter(Boolean), [reachableKey]);
  const uiValue = usePayUiValue({ locale, t, dir, unstyled, assetBaseUrl: assetBaseUrl ?? reachable[0] });

  useEffect(() => {
    if (fontBaseUrl === false) return;
    registerFontFaces(fontBaseUrl ? [fontBaseUrl] : reachable.map((origin) => `${origin}/fonts`));
  }, [fontBaseUrl, reachable]);

  const value = useMemo<PayRootValue>(
    () => ({
      client,
      mode,
      flow,
      open,
      setOpen,
      restart,
      t,
      locale,
      intl: intlLocale(locale),
      dir,
      theme: theme === "auto" ? undefined : theme,
      skin,
      unstyled,
      picker,
      cryptoCache,
    }),
    [client, mode, flow, open, setOpen, restart, t, locale, dir, theme, skin, unstyled, picker, cryptoCache],
  );

  const fallbackActive =
    fallback === "iframe" &&
    clientState.status === "error" &&
    clientState.error !== null &&
    FALLBACK_CODES.has(clientState.error.code);

  useEffect(() => {
    if (fallbackActive) flow.actions.destroy();
  }, [fallbackActive, flow]);

  const rootStyle: CSSProperties = { ...(variables as CSSProperties), ...style };

  return (
    <div
      {...rest}
      ref={ref}
      className={cx(!unstyled && "bp-root", className)}
      style={rootStyle}
      data-binodex-pay="root"
      data-theme={theme}
      data-skin={skin}
      data-mode={mode}
      data-state={open ? "open" : "closed"}
      data-status={clientState.status}
      data-fallback={fallbackActive ? "iframe" : undefined}
      dir={dir}
      lang={intlLocale(locale)}
    >
      {fallbackActive ? (
        <LegacyFallback
          mode={mode}
          sessionEndpoint={sessionEndpoint}
          createSession={hasCreateSession ? createSession : undefined}
          clientId={clientId}
          platformUrl={platformUrl}
          allowedWidgetOrigins={allowedWidgetOrigins}
          lang={intlLocale(locale)}
          theme={theme === "auto" ? undefined : theme}
          open={open}
          setOpen={setOpen}
          onEvent={(event) => latest.current.onEvent?.(event)}
          loading={t("common.loading")}
        />
      ) : (
        <PayRootContext.Provider value={value}>
          <PayUiValueProvider value={uiValue}>{children}</PayUiValueProvider>
        </PayRootContext.Provider>
      )}
    </div>
  );
});

interface LegacyFallbackProps {
  mode: PayMode;
  sessionEndpoint?: string;
  createSession?: CreateSession;
  clientId?: string;
  platformUrl?: string;
  allowedWidgetOrigins?: readonly string[];
  lang: string;
  theme: PayTheme | undefined;
  open: boolean;
  setOpen: (open: boolean) => void;
  onEvent: (event: PayEvent) => void;
  loading: string;
}

function LegacyFallback(props: LegacyFallbackProps) {
  const source = props.createSession
    ? { createSession: props.createSession }
    : { sessionEndpoint: props.sessionEndpoint ?? "" };
  return (
    <Legacy.Root
      {...source}
      mode={props.mode}
      clientId={props.clientId}
      platformUrl={props.platformUrl}
      allowedWidgetOrigins={props.allowedWidgetOrigins}
      lang={props.lang}
      theme={props.theme}
      open={props.open}
      onOpenChange={props.setOpen}
      onCredited={() => undefined}
      onError={(error) =>
        props.onEvent({ type: "error", code: "SESSION_FAILED", scope: `fallback:${error.code}`, at: Date.now(), source: "client" })
      }
    >
      <Legacy.Loader className="bp-loader">
        {props.loading}
      </Legacy.Loader>
      <Legacy.Status className="bp-error" />
      <Legacy.Frame title={props.mode === "withdraw" ? "Withdraw" : "Deposit"} />
    </Legacy.Root>
  );
}
