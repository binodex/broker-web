"use client";

import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type ReactNode,
  type Ref,
} from "react";
import { warnMissingParts } from "./dev.js";
import { heightBounds, runPayFrame } from "./frame.js";
import { isLoadingStatus, missingParts } from "./parts.js";
import type {
  CreateSession,
  CreditedEvent,
  FrameOptions,
  PayError,
  PayPart,
  PayStatus,
  PayWidgetOptions,
} from "./types.js";

export type {
  CreateSession,
  CreateSessionContext,
  CreditedEvent,
  FrameOptions,
  PayError,
  PayErrorCode,
  PayMode,
  PayPart,
  PayStatus,
  PayTheme,
  PayWidgetOptions,
  WidgetSession,
} from "./types.js";

const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

const subscribeToNothing = () => () => undefined;

interface RunState {
  status: PayStatus;
  error: PayError | null;
  height: number | null;
}

const IDLE: RunState = { status: "idle", error: null, height: null };

interface PayContextValue {
  armed: boolean;
  open: boolean;
  status: PayStatus;
  error: PayError | null;
  height: number | null;
  frameId: string;
  setOpen: (open: boolean) => void;
  register: (part: PayPart) => () => void;
  run: (container: HTMLElement, frame: FrameOptions) => () => void;
}

const PayContext = createContext<PayContextValue | null>(null);

const usePayContext = (owner: string): PayContextValue => {
  const context = useContext(PayContext);
  if (!context) {
    throw new Error(
      `${owner} must be used inside <Root> from @binopartner/pay-sdk/react`,
    );
  }
  return context;
};

const usePart = (owner: string, part: PayPart): PayContextValue => {
  const context = usePayContext(owner);
  const { register } = context;
  useIsomorphicLayoutEffect(() => register(part), [register, part]);
  return context;
};

const assignRef = <T,>(ref: Ref<T> | undefined, value: T | null) => {
  if (typeof ref === "function") ref(value);
  else if (ref) (ref as { current: T | null }).current = value;
};

export type RootProps = PayWidgetOptions & {
  children?: ReactNode;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  onCredited?: (event: CreditedEvent) => void;
  onError?: (error: PayError) => void;
  onStatusChange?: (status: PayStatus) => void;
  required?: readonly PayPart[];
};

export function Root(props: RootProps) {
  const { children, open: openProp, defaultOpen = true, required } = props;
  const latest = useRef(props);
  useIsomorphicLayoutEffect(() => {
    latest.current = props;
  });
  const isClient = useSyncExternalStore(
    subscribeToNothing,
    () => true,
    () => false,
  );
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const open = openProp ?? uncontrolledOpen;
  const [runState, setRunState] = useState<RunState>(IDLE);
  const counts = useRef(new Map<PayPart, number>());
  const [partsVersion, bumpParts] = useReducer((value: number) => value + 1, 0);
  const [verdict, setVerdict] = useState<"probe" | "valid" | "invalid">(
    "probe",
  );
  const frameId = useId();
  const requiredKey = (required ?? []).join(" ");

  const setOpen = useCallback((next: boolean) => {
    if (latest.current.open === undefined) setUncontrolledOpen(next);
    latest.current.onOpenChange?.(next);
  }, []);

  const register = useCallback((part: PayPart) => {
    counts.current.set(part, (counts.current.get(part) ?? 0) + 1);
    bumpParts();
    return () => {
      counts.current.set(part, (counts.current.get(part) ?? 1) - 1);
      bumpParts();
    };
  }, []);

  useIsomorphicLayoutEffect(() => {
    if (!isClient) return;
    const extra = requiredKey ? (requiredKey.split(" ") as PayPart[]) : [];
    const missing = missingParts(
      (part) => (counts.current.get(part) ?? 0) > 0,
      extra,
    );
    if (missing.length === 0) {
      setVerdict("valid");
      return;
    }
    if (verdict !== "invalid") warnMissingParts("<Root>", missing);
    setVerdict("invalid");
  }, [isClient, partsVersion, requiredKey, verdict]);

  const createSession = useCallback<CreateSession>((context) => {
    const source = latest.current.createSession;
    return source
      ? source(context)
      : Promise.reject(new Error("createSession is no longer provided"));
  }, []);

  const { mode, lang, theme } = props;
  const run = useCallback(
    (container: HTMLElement, frame: FrameOptions) => {
      const current = latest.current;
      const source = current.createSession
        ? { createSession }
        : { sessionEndpoint: current.sessionEndpoint ?? "" };
      const stop = runPayFrame(
        container,
        {
          ...source,
          mode,
          lang,
          theme,
          clientId: current.clientId,
          platformUrl: current.platformUrl,
          requireChannel: current.requireChannel,
          ...frame,
        },
        {
          status: (status, error) => {
            setRunState((previous) => ({ ...previous, status, error }));
            latest.current.onStatusChange?.(status);
            if (error) latest.current.onError?.(error);
          },
          height: (height) =>
            setRunState((previous) => ({ ...previous, height })),
          credited: (event) => latest.current.onCredited?.(event),
          close: () => setOpen(false),
        },
      );
      return () => {
        stop();
        setRunState(IDLE);
      };
    },
    [createSession, mode, lang, theme, setOpen],
  );

  const value = useMemo<PayContextValue>(
    () => ({
      armed: verdict === "valid",
      open,
      status: runState.status,
      error: runState.error,
      height: runState.height,
      frameId,
      setOpen,
      register,
      run,
    }),
    [verdict, open, runState, frameId, setOpen, register, run],
  );

  if (!isClient || verdict === "invalid") return null;
  return <PayContext.Provider value={value}>{children}</PayContext.Provider>;
}

export type FrameProps = Omit<HTMLAttributes<HTMLDivElement>, "children"> &
  FrameOptions;

export const Frame = forwardRef<HTMLDivElement, FrameProps>(function Frame(
  { title, initialHeight, minHeight, maxHeight, style, ...rest },
  forwardedRef,
) {
  const context = usePart("<Frame>", "frame");
  const { armed, open, run } = context;
  const active = armed && open;
  const container = useRef<HTMLDivElement | null>(null);
  const frameOptions = useRef<FrameOptions>({});
  useIsomorphicLayoutEffect(() => {
    frameOptions.current = { title, initialHeight, minHeight, maxHeight };
  });

  useEffect(() => {
    const element = container.current;
    if (!active || !element) return;
    return run(element, frameOptions.current);
  }, [active, run]);

  const setContainer = useCallback(
    (element: HTMLDivElement | null) => {
      container.current = element;
      assignRef(forwardedRef, element);
    },
    [forwardedRef],
  );

  if (!active) return null;
  const reserved =
    context.height ??
    heightBounds({ initialHeight, minHeight, maxHeight }).initial;
  return (
    <div
      {...rest}
      ref={setContainer}
      id={context.frameId}
      data-binodex-pay="frame"
      data-state="open"
      data-status={context.status}
      style={{ minHeight: reserved, ...style }}
    />
  );
});

export type TriggerProps = ButtonHTMLAttributes<HTMLButtonElement>;

export const Trigger = forwardRef<HTMLButtonElement, TriggerProps>(
  function Trigger({ onClick, type = "button", ...rest }, ref) {
    const context = usePart("<Trigger>", "trigger");
    if (!context.armed) return null;
    return (
      <button
        type={type}
        aria-expanded={context.open}
        aria-controls={context.open ? context.frameId : undefined}
        {...rest}
        ref={ref}
        data-binodex-pay="trigger"
        data-state={context.open ? "open" : "closed"}
        onClick={(event) => {
          onClick?.(event);
          if (!event.defaultPrevented) context.setOpen(true);
        }}
      />
    );
  },
);

export type CloseProps = ButtonHTMLAttributes<HTMLButtonElement>;

export const Close = forwardRef<HTMLButtonElement, CloseProps>(function Close(
  { onClick, type = "button", children, ...rest },
  ref,
) {
  const context = usePart("<Close>", "close");
  if (!context.armed || !context.open) return null;
  return (
    <button
      type={type}
      aria-label={children ? undefined : "Close"}
      {...rest}
      ref={ref}
      data-binodex-pay="close"
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) context.setOpen(false);
      }}
    >
      {children}
    </button>
  );
});

export type LoaderProps = HTMLAttributes<HTMLDivElement>;

export const Loader = forwardRef<HTMLDivElement, LoaderProps>(function Loader(
  { children, ...rest },
  ref,
) {
  const context = usePart("<Loader>", "loader");
  if (!context.armed || !context.open || !isLoadingStatus(context.status)) {
    return null;
  }
  return (
    <div
      role="status"
      aria-live="polite"
      {...rest}
      ref={ref}
      data-binodex-pay="loader"
      data-status={context.status}
    >
      {children ?? "Loading payment form…"}
    </div>
  );
});

export type StatusProps = Omit<HTMLAttributes<HTMLDivElement>, "children"> & {
  children?: ReactNode | ((error: PayError) => ReactNode);
};

export const Status = forwardRef<HTMLDivElement, StatusProps>(function Status(
  { children, ...rest },
  ref,
) {
  const context = usePart("<Status>", "status");
  const { error } = context;
  if (!context.armed || !context.open || context.status !== "error" || !error) {
    return null;
  }
  return (
    <div
      role="alert"
      {...rest}
      ref={ref}
      data-binodex-pay="status"
      data-error={error.code}
    >
      {typeof children === "function"
        ? children(error)
        : (children ?? error.message)}
    </div>
  );
});

export interface UsePayWidgetResult {
  open: boolean;
  setOpen: (open: boolean) => void;
  status: PayStatus;
  error: PayError | null;
}

export function usePayWidget(): UsePayWidgetResult {
  const { open, setOpen, status, error } = usePayContext("usePayWidget()");
  return { open, setOpen, status, error };
}
