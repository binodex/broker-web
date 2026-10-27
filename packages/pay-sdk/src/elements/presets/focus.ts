"use client";

import { useCallback, useEffect, useRef, type Ref } from "react";
import { assignRef } from "../part.js";

export const useStepFocus = <T extends HTMLElement>(step: string, forwarded: Ref<T> | undefined) => {
  const node = useRef<T | null>(null);
  const previous = useRef(step);
  useEffect(() => {
    if (previous.current === step) return;
    previous.current = step;
    const element = node.current;
    if (!element || typeof document === "undefined") return;
    const active = document.activeElement;
    if (active && active !== document.body) return;
    const target =
      element.querySelector<HTMLElement>("input:not([disabled]), [role=alert], [role=status]") ?? element;
    if (target !== element && !target.matches("input")) target.setAttribute("tabindex", "-1");
    target.focus({ preventScroll: true });
  }, [step]);
  return useCallback(
    (element: T | null) => {
      node.current = element;
      assignRef(forwarded, element);
    },
    [forwarded],
  );
};
