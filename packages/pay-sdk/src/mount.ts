import { warnMissingParts } from "./dev.js";
import { runPayFrame } from "./frame.js";
import {
  PART_ATTRIBUTE,
  isLoadingStatus,
  isPayPart,
  missingParts,
} from "./parts.js";
import type {
  CreditedEvent,
  FrameOptions,
  PayError,
  PayPart,
  PayStatus,
  PayWidgetOptions,
} from "./types.js";

export type MountOptions = PayWidgetOptions &
  FrameOptions & {
    open?: boolean;
    required?: readonly PayPart[];
    onOpenChange?: (open: boolean) => void;
    onCredited?: (event: CreditedEvent) => void;
    onError?: (error: PayError) => void;
    onStatusChange?: (status: PayStatus) => void;
  };

export interface PayWidgetState {
  open: boolean;
  status: PayStatus;
  error: PayError | null;
}

export interface PayWidget {
  open: () => void;
  close: () => void;
  destroy: () => void;
  getState: () => PayWidgetState;
}

const collectParts = (root: HTMLElement): Map<PayPart, HTMLElement[]> => {
  const parts = new Map<PayPart, HTMLElement[]>();
  root
    .querySelectorAll<HTMLElement>(`[${PART_ATTRIBUTE}]`)
    .forEach((element) => {
      const name = element.getAttribute(PART_ATTRIBUTE);
      if (!isPayPart(name)) return;
      parts.set(name, [...(parts.get(name) ?? []), element]);
    });
  return parts;
};

export const mount = (
  root: HTMLElement,
  options: MountOptions,
): PayWidget | null => {
  const parts = collectParts(root);
  const missing = missingParts((part) => parts.has(part), options.required);
  const [frameElement] = parts.get("frame") ?? [];
  if (missing.length > 0 || !frameElement) {
    warnMissingParts("mount()", missing);
    root.hidden = true;
    return null;
  }
  const triggers = parts.get("trigger") ?? [];
  const closers = parts.get("close") ?? [];
  const loaders = parts.get("loader") ?? [];
  const statuses = parts.get("status") ?? [];
  const fillsStatusText = new Map(
    statuses.map((element) => [element, element.childNodes.length === 0]),
  );
  if (!frameElement.id) {
    frameElement.id = `binodex-pay-${Math.random().toString(36).slice(2, 10)}`;
  }

  let open = options.open ?? true;
  let status: PayStatus = "idle";
  let error: PayError | null = null;
  let stop: (() => void) | null = null;
  let destroyed = false;

  const render = () => {
    const state = open ? "open" : "closed";
    root.setAttribute("data-state", state);
    root.setAttribute("data-status", status);
    frameElement.hidden = !open;
    frameElement.setAttribute("data-state", state);
    frameElement.setAttribute("data-status", status);
    triggers.forEach((element) => {
      element.setAttribute("aria-expanded", String(open));
      element.setAttribute("aria-controls", frameElement.id);
    });
    closers.forEach((element) => {
      element.hidden = !open;
    });
    loaders.forEach((element) => {
      element.hidden = !(open && isLoadingStatus(status));
    });
    statuses.forEach((element) => {
      element.hidden = !(open && status === "error");
      if (fillsStatusText.get(element)) {
        element.textContent = status === "error" && error ? error.message : "";
      }
    });
  };

  const halt = () => {
    stop?.();
    stop = null;
    status = "idle";
    error = null;
    frameElement.style.minHeight = "";
  };

  const setOpen = (next: boolean) => {
    if (destroyed || next === open) return;
    open = next;
    if (open) start();
    else halt();
    render();
    options.onOpenChange?.(open);
  };

  function start() {
    if (stop || destroyed) return;
    stop = runPayFrame(frameElement, options, {
      status: (next, nextError) => {
        status = next;
        error = nextError;
        render();
        options.onStatusChange?.(next);
        if (nextError) options.onError?.(nextError);
      },
      height: (height) => {
        frameElement.style.minHeight = `${height}px`;
      },
      credited: (event) => options.onCredited?.(event),
      close: () => setOpen(false),
    });
  }

  const onTrigger = () => setOpen(true);
  const onClose = () => setOpen(false);
  triggers.forEach((element) => element.addEventListener("click", onTrigger));
  closers.forEach((element) => element.addEventListener("click", onClose));

  render();
  if (open) start();

  return {
    open: () => setOpen(true),
    close: () => setOpen(false),
    destroy: () => {
      if (destroyed) return;
      halt();
      destroyed = true;
      triggers.forEach((element) =>
        element.removeEventListener("click", onTrigger),
      );
      closers.forEach((element) =>
        element.removeEventListener("click", onClose),
      );
    },
    getState: () => ({ open, status, error }),
  };
};
