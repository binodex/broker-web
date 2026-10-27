import { ar } from "./ar.js";
import { translatorFrom, type PayLocale, type Translate } from "./base.js";
import { cs } from "./cs.js";
import { de } from "./de.js";
import { en, type MessageKey, type Messages } from "./en.js";
import { es } from "./es.js";
import { fr } from "./fr.js";
import { hi } from "./hi.js";
import { it } from "./it.js";
import { ru } from "./ru.js";
import { tr } from "./tr.js";
import { ua } from "./ua.js";

export * from "./base.js";

export const CATALOGS: Record<PayLocale, Messages> = {
  en,
  ru,
  de,
  ua,
  es,
  fr,
  hi,
  tr,
  ar,
  it,
  cs,
};

export const createTranslator = (
  locale: PayLocale,
  overrides?: Partial<Record<MessageKey, string>>,
): Translate => translatorFrom(CATALOGS[locale], overrides, en);

export const isMessageKey = (key: string): key is MessageKey => Object.prototype.hasOwnProperty.call(en, key);

export interface MethodCopy {
  label: string | null;
  subtitle: string | null;
}

// Rails ship their catalog copy in the country's language; known methods follow the UI locale instead.
export const methodCopy = (
  t: Translate,
  method: { rail: string; methodId: string; label: string | null; subtitle: string | null },
): MethodCopy => {
  const key = `method.${method.rail}.${method.methodId}`;
  if (!isMessageKey(key)) return { label: method.label, subtitle: method.subtitle };
  const subtitleKey = `${key}.sub`;
  return {
    label: t(key),
    subtitle: isMessageKey(subtitleKey) ? t(subtitleKey) : method.subtitle,
  };
};

