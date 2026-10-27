"use client";

import { forwardRef, type SVGAttributes } from "react";
import type { QrEcc } from "../../ui/qr-encode.js";
import { QrSvg, qrMatrixOf } from "../../ui/crypto.js";
import { usePayRoot } from "../context.js";
import { partProps, type PartStyleProps } from "../part.js";

const safeHttps = (value: string | null | undefined): string | null => {
  if (!value) return null;
  try {
    return new URL(value).protocol === "https:" ? value : null;
  } catch {
    return null;
  }
};

export type QrProps = Omit<SVGAttributes<SVGSVGElement>, "className" | "style" | "children"> &
  PartStyleProps & {
    value: string;
    fallbackUrl?: string | null;
    size?: number;
    ecc?: QrEcc;
    label?: string;
  };

export const Qr = forwardRef<SVGSVGElement, QrProps>(function Qr(
  { value, fallbackUrl, size = 176, ecc = "M", label, className, style, unstyled, ...rest },
  ref,
) {
  const root = usePayRoot("<Pay.Qr>");
  if (!qrMatrixOf(value, ecc, 4)) {
    const part = partProps("qr", { className, style, unstyled }, root.unstyled, { sensitive: true });
    const image = safeHttps(fallbackUrl);
    if (image) {
      return (
        <img
          {...part}
          src={image}
          alt={label ?? root.t("qr.label")}
          width={size}
          height={size}
          referrerPolicy="no-referrer"
          data-fallback=""
        />
      );
    }
    return (
      <div {...part} role="alert" data-error="QR_UNAVAILABLE">
        {root.t("error.UNKNOWN")}
      </div>
    );
  }
  return (
    <QrSvg
      {...rest}
      ref={ref}
      value={value}
      size={size}
      ecc={ecc}
      label={label}
      className={className}
      style={style}
      unstyled={unstyled ?? root.unstyled}
    />
  );
});
