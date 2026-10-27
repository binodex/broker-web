import type { ReactNode } from "react";
import type { DataAttributes } from "./part.js";

export type StatusTone = "pending" | "completed" | "failed";

export type ResultState = "pending" | "success" | "failed";

export interface MethodOption {
  id: string;
  label: string;
  subtitle?: string | null;
  minLabel?: string | null;
  logoKey?: string;
  disabled?: boolean;
  attrs?: DataAttributes;
}

export interface EntryOption {
  id: string;
  title: ReactNode;
  subtitle?: ReactNode;
  icon?: ReactNode;
  icons?: ReactNode[];
  disabled?: boolean;
  attrs?: DataAttributes;
}

export interface EntryTab {
  id: string;
  label: ReactNode;
  attrs?: DataAttributes;
}

export interface RouteOption {
  value: string;
  label: string;
  icon?: ReactNode;
  disabled?: boolean;
  hint?: string | null;
  attrs?: DataAttributes;
}

export interface CountryOption {
  code: string;
  name?: string;
}

export interface SummaryRow {
  label: ReactNode;
  value: ReactNode;
  key?: string;
}

export interface QuoteRow {
  label: ReactNode;
  value: ReactNode;
  icon?: ReactNode;
  tone?: "default" | "warning";
  key?: string;
  attrs?: DataAttributes;
}

export interface RequisiteRow {
  label: string;
  value: string;
  copy?: string;
  mono?: boolean;
  accent?: boolean;
  key?: string;
  attrs?: DataAttributes;
}

export interface DetailRow {
  label: ReactNode;
  value: ReactNode;
  key?: string;
  attrs?: DataAttributes;
}
