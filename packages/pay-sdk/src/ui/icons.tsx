"use client";

import { useId, useState } from "react";
import { usePayUi } from "./context.js";

export interface IconProps {
  size?: number;
  className?: string;
}

const svgId = (raw: string) => `bp${raw.replace(/[^a-zA-Z0-9_-]/g, "")}`;

export const CloseIcon = ({ size = 14, className }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 14 14" fill="none" aria-hidden="true" className={className}>
    <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);

export const BackIcon = ({ size = 16, className }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true" className={className}>
    <path
      d="M13.3346 8H2.66797M6.66797 12L2.66797 8L6.66797 4"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const CopyIcon = ({ size = 20, className }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden="true" className={className}>
    <path
      d="M5.5 9.49774C5.5 7.22591 5.5 6.09 6.20294 5.38423C6.90589 4.67847 8.03726 4.67847 10.3 4.67847H12.7C14.9627 4.67847 16.0941 4.67847 16.7971 5.38423C17.5 6.09 17.5 7.22591 17.5 9.49774V13.5138C17.5 15.7856 17.5 16.9216 16.7971 17.6273C16.0941 18.3331 14.9627 18.3331 12.7 18.3331H10.3C8.03726 18.3331 6.90589 18.3331 6.20294 17.6273C5.5 16.9216 5.5 15.7856 5.5 13.5138V9.49774Z"
      fill="currentColor"
    />
    <path
      opacity="0.5"
      d="M3.47631 2.64306C2.5 3.61937 2.5 5.19072 2.5 8.33341V10.0001C2.5 13.1428 2.5 14.7141 3.47631 15.6904C3.99094 16.2051 4.67091 16.4484 5.65921 16.5635C5.49968 15.8629 5.49967 14.8997 5.49967 13.514V9.49791C5.49967 7.22608 5.49967 6.09016 6.20262 5.3844C6.90556 4.67863 8.03693 4.67863 10.2997 4.67863H12.6997C14.0762 4.67863 15.034 4.67863 15.7314 4.83753C15.6169 3.84297 15.3737 3.1597 14.857 2.64306C13.8807 1.66675 12.3094 1.66675 9.16667 1.66675C6.02397 1.66675 4.45262 1.66675 3.47631 2.64306Z"
      fill="currentColor"
    />
  </svg>
);

export const CheckIcon = ({ size = 12, className }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 12 12" fill="none" aria-hidden="true" className={className}>
    <path d="M2 6.2 4.8 9 10 3.4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const CopiedIcon = ({ size = 20, className }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden="true" className={className}>
    <path d="M4 10l4.5 4.5L16 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const RowCheckIcon = ({ size = 14, className }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 14 14" fill="none" aria-hidden="true" className={className}>
    <path d="M2 7l3.5 3.5L12 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const CreditCheckIcon = ({ size = 16, className }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true" className={className}>
    <path d="M3.5 8l3 3 6-7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const ChevronIcon = ({ size = 12, className }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 12 12" fill="none" aria-hidden="true" className={className}>
    <path
      d="M9.34061 6.99012L7.73561 5.38512L6.75561 4.40012C6.34061 3.98512 5.66561 3.98512 5.25061 4.40012L2.66061 6.99012C2.32061 7.33012 2.56561 7.91012 3.04061 7.91012L5.84561 7.91012L8.96061 7.91012C9.44061 7.91012 9.68061 7.33012 9.34061 6.99012Z"
      fill="currentColor"
    />
  </svg>
);

export const WarningIcon = ({ size = 20, className }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden="true" className={className}>
    <path
      opacity="0.5"
      d="M10.0013 2.5C8.07568 2.5 6.8597 4.65597 4.42773 8.96791L4.12468 9.50523C2.10373 13.0884 1.09325 14.88 2.00652 16.19C2.91978 17.5 5.17927 17.5 9.69825 17.5H10.3044C14.8233 17.5 17.0828 17.5 17.9961 16.19C18.9093 14.88 17.8989 13.0884 15.8779 9.50522L15.5749 8.96791C13.1429 4.65597 11.9269 2.5 10.0013 2.5Z"
      fill="currentColor"
    />
    <path
      d="M10.0013 6.04175C10.3465 6.04175 10.6263 6.32157 10.6263 6.66675V10.8334C10.6263 11.1786 10.3465 11.4584 10.0013 11.4584C9.65612 11.4584 9.3763 11.1786 9.3763 10.8334V6.66675C9.3763 6.32157 9.65612 6.04175 10.0013 6.04175Z"
      fill="currentColor"
    />
    <path
      d="M10.0013 14.1667C10.4615 14.1667 10.8346 13.7937 10.8346 13.3334C10.8346 12.8732 10.4615 12.5001 10.0013 12.5001C9.54106 12.5001 9.16797 12.8732 9.16797 13.3334C9.16797 13.7937 9.54106 14.1667 10.0013 14.1667Z"
      fill="currentColor"
    />
  </svg>
);

export const ExplorerIcon = ({ size = 14, className }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 14 14" fill="none" aria-hidden="true" className={className}>
    <path
      d="M5.5 3H3.5a1 1 0 0 0-1 1v6.5a1 1 0 0 0 1 1H10a1 1 0 0 0 1-1v-2"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path d="M8 2.5h3.5V6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M11.3 2.7 6.5 7.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
  </svg>
);

export const PaperclipIcon = ({ size = 14, className }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true" className={className}>
    <path
      d="M13.5 7.4 8.1 12.8a3.3 3.3 0 0 1-4.7-4.7l5.6-5.6a2.2 2.2 0 0 1 3.1 3.1L6.5 11.2a1.1 1.1 0 0 1-1.6-1.6l5-5"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const GeoIcon = ({ size = 36, className }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
    <path
      d="M12 21s6.5-5.2 6.5-10.5a6.5 6.5 0 1 0-13 0C5.5 15.8 12 21 12 21Z"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
    />
    <path d="M9.7 8.2l4.6 4.6M14.3 8.2l-4.6 4.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);

export const SuccessIcon = ({ size = 58, className }: IconProps) => {
  const id = svgId(useId());
  return (
    <svg width={size} height={size} viewBox="0 0 58 58" fill="none" aria-hidden="true" className={className}>
      <rect width="58" height="58" rx="29" fill={`url(#${id})`} fillOpacity="0.3" />
      <path
        opacity="0.5"
        d="M49 29C49 40.0457 40.0457 49 29 49C17.9543 49 9 40.0457 9 29C9 17.9543 17.9543 9 29 9C40.0457 9 49 17.9543 49 29Z"
        fill="var(--bp-color-accent-text, #80F6BC)"
      />
      <path
        d="M37.0607 22.9393C37.6464 23.5251 37.6464 24.4749 37.0607 25.0607L27.0607 35.0607C26.4749 35.6464 25.5251 35.6464 24.9393 35.0607L20.9393 31.0607C20.3536 30.4749 20.3536 29.5251 20.9393 28.9393C21.5251 28.3536 22.4749 28.3536 23.0607 28.9393L26 31.8787L30.4697 27.409L34.9393 22.9393C35.5251 22.3536 36.4749 22.3536 37.0607 22.9393Z"
        fill="var(--bp-color-accent-text, #80F6BC)"
      />
      <defs>
        <linearGradient id={id} x1="29" y1="0" x2="29" y2="58" gradientUnits="userSpaceOnUse">
          <stop stopColor="var(--bp-color-accent-text, #80F6BC)" />
          <stop offset="1" stopColor="var(--bp-color-accent-text, #80F6BC)" stopOpacity="0.2" />
        </linearGradient>
      </defs>
    </svg>
  );
};

export const FailIcon = ({ size = 28, className }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 28 28" fill="none" aria-hidden="true" className={className}>
    <path d="M8 8l12 12M20 8L8 20" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
  </svg>
);

export const TransferCryptoIcon = ({ size = 28, className }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
    <g opacity="0.5" fill="currentColor">
      <path d="M10.5531 13.4469C10.1294 13.0232 9.60212 12.8505 9.01812 12.772C8.46484 12.6976 7.76789 12.6976 6.93209 12.6977L5.82717 12.6977C5.24648 12.6977 4.76184 12.6976 4.36823 12.7351C3.95674 12.7742 3.57325 12.8591 3.22152 13.0746C2.87731 13.2856 2.5879 13.575 2.37697 13.9192C2.16142 14.2709 2.07653 14.6544 2.0374 15.0659C1.99998 15.4595 1.99999 15.9442 2 16.5249V16.5932C1.99999 17.477 1.99999 18.1897 2.05454 18.7635C2.1108 19.3552 2.22996 19.8707 2.51405 20.3343C2.80168 20.8037 3.19632 21.1983 3.6657 21.486C4.12929 21.77 4.64482 21.8892 5.23653 21.9455C5.8103 22 6.52304 22 7.40683 22H7.47507C8.05577 22 8.54048 22 8.9341 21.9626C9.34559 21.9235 9.72907 21.8386 10.0808 21.623C10.425 21.4121 10.7144 21.1227 10.9254 20.7785C11.1409 20.4267 11.2258 20.0433 11.2649 19.6318C11.3024 19.2382 11.3023 18.7535 11.3023 18.1728L11.3023 17.0679C11.3024 16.2321 11.3024 15.5352 11.228 14.9819C11.1495 14.3979 10.9768 13.8706 10.5531 13.4469Z" />
      <path d="M8.9341 2.0374C9.34559 2.07653 9.72907 2.16142 10.0808 2.37697C10.425 2.5879 10.7144 2.87731 10.9254 3.22152C11.1409 3.57325 11.2258 3.95674 11.2649 4.36823C11.3024 4.76183 11.3023 5.24658 11.3023 5.82726L11.3023 6.93212C11.3024 7.7679 11.3024 8.46484 11.228 9.01812C11.1495 9.60212 10.9768 10.1294 10.5531 10.5531C10.1294 10.9768 9.60212 11.1495 9.01812 11.228C8.46484 11.3024 7.76787 11.3024 6.93209 11.3023L5.82711 11.3023C5.24643 11.3023 4.76183 11.3024 4.36823 11.2649C3.95674 11.2258 3.57325 11.1409 3.22152 10.9254C2.87731 10.7144 2.5879 10.425 2.37697 10.0808C2.16142 9.72907 2.07653 9.34559 2.0374 8.9341C1.99998 8.54047 1.99999 8.05579 2 7.47506V7.40679C1.99999 6.52302 1.99999 5.81029 2.05454 5.23653C2.1108 4.64482 2.22996 4.12929 2.51405 3.6657C2.80168 3.19632 3.19632 2.80168 3.6657 2.51405C4.12929 2.22996 4.64482 2.1108 5.23653 2.05454C5.81029 1.99999 6.52307 1.99999 7.40684 2H7.4751C8.05583 1.99999 8.54047 1.99998 8.9341 2.0374Z" />
      <path d="M16.5932 2H16.5249C15.9442 1.99999 15.4595 1.99998 15.0659 2.0374C14.6544 2.07653 14.2709 2.16142 13.9192 2.37697C13.575 2.5879 13.2856 2.87731 13.0746 3.22152C12.8591 3.57325 12.7742 3.95674 12.7351 4.36823C12.6976 4.76185 12.6977 5.24654 12.6977 5.82725L12.6977 6.93209C12.6976 7.76789 12.6976 8.46484 12.772 9.01812C12.8505 9.60212 13.0232 10.1294 13.4469 10.5531C13.8706 10.9768 14.3979 11.1495 14.9819 11.228C15.5352 11.3024 16.2321 11.3024 17.0679 11.3023L18.1728 11.3023C18.7535 11.3023 19.2382 11.3024 19.6318 11.2649C20.0433 11.2258 20.4267 11.1409 20.7785 10.9254C21.1227 10.7144 21.4121 10.425 21.623 10.0808C21.8386 9.72907 21.9235 9.34559 21.9626 8.9341C22 8.54048 22 8.05587 22 7.47517V7.40683C22 6.52304 22 5.8103 21.9455 5.23653C21.8892 4.64482 21.77 4.12929 21.486 3.6657C21.1983 3.19632 20.8037 2.80168 20.3343 2.51405C19.8707 2.22996 19.3552 2.1108 18.7635 2.05454C18.1897 1.99999 17.477 1.99999 16.5932 2Z" />
    </g>
    <path opacity="0.4" d="M14.0946 21.3024C14.0946 21.6877 13.7822 22.0001 13.3969 22.0001C13.0116 22.0001 12.6992 21.6877 12.6992 21.3024V18.5117H14.0946V21.3024Z" fill="currentColor" />
    <path opacity="0.5" d="M21.3031 12.6978C20.9178 12.6978 20.6055 13.0101 20.6055 13.3954V16.6512H22.0008V13.3954C22.0008 13.0101 21.6885 12.6978 21.3031 12.6978Z" fill="currentColor" />
    <path d="M16.0761 16.6173C16 16.8011 16 17.0341 16 17.5C16 17.9659 16 18.1989 16.0761 18.3827C16.1776 18.6277 16.3723 18.8224 16.6173 18.9239C16.8011 19 17.0341 19 17.5 19C17.9659 19 18.1989 19 18.3827 18.9239C18.6277 18.8224 18.8224 18.6277 18.9239 18.3827C19 18.1989 19 17.9659 19 17.5C19 17.0341 19 16.8011 18.9239 16.6173C18.8224 16.3723 18.6277 16.1776 18.3827 16.0761C18.1989 16 17.9659 16 17.5 16C17.0341 16 16.8011 16 16.6173 16.0761C16.3723 16.1776 16.1776 16.3723 16.0761 16.6173Z" fill="currentColor" />
    <path opacity="0.7" d="M22.0012 18.5352V18.5117H20.6058C20.6058 18.9547 20.6055 19.252 20.5897 19.4822C20.5745 19.7061 20.547 19.8152 20.5173 19.8869C20.3993 20.1718 20.1729 20.3982 19.888 20.5162C19.8163 20.546 19.7072 20.5734 19.4833 20.5887C19.2531 20.6044 18.9558 20.6047 18.5128 20.6047H16.6523V22.0001H18.5363C18.9498 22.0001 19.2949 22.0001 19.5783 21.9808C19.8732 21.9606 20.1519 21.9173 20.422 21.8054C21.0488 21.5457 21.5468 21.0477 21.8065 20.4209C21.9183 20.1508 21.9617 19.8722 21.9819 19.5772C22.0012 19.2938 22.0012 18.9487 22.0012 18.5352Z" fill="currentColor" />
    <path opacity="0.6" d="M12.6953 16.6156V16.6512H14.0907C14.0907 15.9835 14.0915 15.5352 14.1263 15.1934C14.1599 14.8633 14.2192 14.7108 14.2866 14.6099C14.3715 14.4829 14.4805 14.3739 14.6074 14.2891C14.7083 14.2217 14.8609 14.1623 15.191 14.1287C15.5327 14.0939 15.981 14.0931 16.6488 14.0931H18.5093V12.6978H16.6131C15.9903 12.6977 15.4705 12.6977 15.0498 12.7405C14.6093 12.7853 14.2006 12.8827 13.8322 13.1289C13.5529 13.3155 13.3131 13.5553 13.1264 13.8347C12.8803 14.203 12.7829 14.6118 12.7381 15.0522C12.6953 15.473 12.6953 15.9927 12.6953 16.6156Z" fill="currentColor" />
    <path d="M5.51017 18.6903C5.72852 18.8452 6.03776 18.8452 6.65625 18.8452C7.27474 18.8452 7.58398 18.8452 7.80233 18.6903C7.87938 18.6356 7.94665 18.5683 8.00132 18.4913C8.15625 18.2729 8.15625 17.9637 8.15625 17.3452C8.15625 16.7267 8.15625 16.4175 8.00132 16.1991C7.94665 16.1221 7.87938 16.0548 7.80233 16.0001C7.58398 15.8452 7.27471 15.8452 6.65624 15.8452C6.03776 15.8452 5.72852 15.8452 5.51017 16.0001C5.43312 16.0548 5.36585 16.1221 5.31118 16.1991C5.15625 16.4175 5.15625 16.7267 5.15625 17.3452C5.15625 17.9637 5.15625 18.2729 5.31118 18.4913C5.36585 18.5683 5.43312 18.6356 5.51017 18.6903Z" fill="currentColor" />
    <path d="M6.65625 8.15479C6.03776 8.15479 5.72852 8.15479 5.51017 7.99986C5.43312 7.94519 5.36585 7.87792 5.31118 7.80087C5.15625 7.58252 5.15625 7.27327 5.15625 6.65479C5.15625 6.0363 5.15625 5.72705 5.31118 5.5087C5.36585 5.43165 5.43312 5.36438 5.51017 5.30971C5.72852 5.15479 6.03776 5.15479 6.65625 5.15479C7.27474 5.15479 7.58398 5.15479 7.80233 5.30971C7.87938 5.36438 7.94665 5.43165 8.00132 5.5087C8.15625 5.72705 8.15625 6.0363 8.15625 6.65479C8.15625 7.27327 8.15625 7.58252 8.00132 7.80087C7.94665 7.87792 7.87938 7.94519 7.80233 7.99986C7.58398 8.15479 7.27474 8.15479 6.65625 8.15479Z" fill="currentColor" />
    <path d="M16.1977 8.00024C16.416 8.15517 16.7253 8.15517 17.3437 8.15517C17.9622 8.15517 18.2715 8.15517 18.4898 8.00024C18.5669 7.94558 18.6342 7.8783 18.6888 7.80126C18.8438 7.58291 18.8438 7.27366 18.8438 6.65517C18.8438 6.03668 18.8438 5.72744 18.6888 5.50909C18.6342 5.43204 18.5669 5.36477 18.4898 5.3101C18.2715 5.15517 17.9622 5.15517 17.3437 5.15517C16.7253 5.15517 16.416 5.15517 16.1977 5.3101C16.1206 5.36477 16.0533 5.43204 15.9987 5.50909C15.8438 5.72744 15.8438 6.03671 15.8438 6.65519C15.8438 7.27367 15.8438 7.58291 15.9987 7.80126C16.0533 7.8783 16.1206 7.94558 16.1977 8.00024Z" fill="currentColor" />
  </svg>
);

export const WalletIcon = ({ size = 28, className }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
    <path d="M4.89062 9.61431C4.89062 9.21193 5.21427 8.88574 5.61352 8.88574H9.46894C9.86818 8.88574 10.1918 9.21193 10.1918 9.61431C10.1918 10.0167 9.86818 10.3429 9.46894 10.3429H5.61352C5.21427 10.3429 4.89062 10.0167 4.89062 9.61431Z" fill="currentColor" />
    <path fillRule="evenodd" clipRule="evenodd" d="M21.1884 10.0038C21.1262 9.99995 21.0584 9.99998 20.9881 10L20.9706 10H18.2149C15.9435 10 14 11.7361 14 14C14 16.2639 15.9435 18 18.2149 18H20.9706L20.9881 18C21.0584 18 21.1262 18 21.1884 17.9962C22.111 17.9397 22.927 17.2386 22.9956 16.2594C23.0001 16.1952 23 16.126 23 16.0619L23 16.0444V11.9556L23 11.9381C23 11.874 23.0001 11.8048 22.9956 11.7406C22.927 10.7614 22.111 10.0603 21.1884 10.0038ZM17.9706 15.0667C18.5554 15.0667 19.0294 14.5891 19.0294 14C19.0294 13.4109 18.5554 12.9333 17.9706 12.9333C17.3858 12.9333 16.9118 13.4109 16.9118 14C16.9118 14.5891 17.3858 15.0667 17.9706 15.0667Z" fill="currentColor" />
    <path opacity="0.5" d="M21.1394 10.0015C21.1394 8.82091 21.0965 7.55447 20.3418 6.64658C20.2689 6.55894 20.1914 6.47384 20.1088 6.39124C19.3604 5.64288 18.4114 5.31076 17.239 5.15314C16.0998 4.99997 14.6442 4.99999 12.8064 5H10.6936C8.85583 4.99999 7.40019 4.99997 6.26098 5.15314C5.08856 5.31076 4.13961 5.64288 3.39124 6.39124C2.64288 7.13961 2.31076 8.08856 2.15314 9.26098C1.99997 10.4002 1.99999 11.8558 2 13.6936V13.8064C1.99999 15.6442 1.99997 17.0998 2.15314 18.239C2.31076 19.4114 2.64288 20.3604 3.39124 21.1088C4.13961 21.8571 5.08856 22.1892 6.26098 22.3469C7.40018 22.5 8.8558 22.5 10.6935 22.5H12.8064C14.6442 22.5 16.0998 22.5 17.239 22.3469C18.4114 22.1892 19.3604 21.8571 20.1088 21.1088C20.3133 20.9042 20.487 20.6844 20.6346 20.4486C21.0851 19.7291 21.1394 18.8473 21.1394 17.9985C21.0912 18 21.0404 18 20.9882 18L18.2149 18C15.9435 18 14 16.2639 14 14C14 11.7361 15.9435 10 18.2149 10L20.9881 10C21.0403 9.99999 21.0912 9.99997 21.1394 10.0015Z" fill="currentColor" />
    <path d="M10.1004 2.57211L7.9989 3.99253L6.26562 5.15237C7.40398 4.99997 8.85782 4.99999 10.6925 5H12.8053C14.6431 4.99998 16.0987 4.99997 17.2379 5.15314C17.4671 5.18394 17.6877 5.22142 17.9 5.26737L15.9989 4L13.8864 2.57211C12.7578 1.8093 11.2289 1.8093 10.1004 2.57211Z" fill="currentColor" />
  </svg>
);

export const CardIcon = ({ size = 28, className }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
    <path
      opacity="0.5"
      d="M2 9.5C2 7.01472 2 5.77208 2.73223 5.04604C3.46447 4.32 4.64298 4.32 7 4.32H17C19.357 4.32 20.5355 4.32 21.2678 5.04604C22 5.77208 22 7.01472 22 9.5V14.5C22 16.9853 22 18.2279 21.2678 18.954C20.5355 19.68 19.357 19.68 17 19.68H7C4.64298 19.68 3.46447 19.68 2.73223 18.954C2 18.2279 2 16.9853 2 14.5V9.5Z"
      fill="currentColor"
    />
    <path d="M2 8.5H22V10.5H2V8.5Z" fill="currentColor" />
    <path d="M5.5 15C5.5 14.5858 5.83579 14.25 6.25 14.25H10.25C10.6642 14.25 11 14.5858 11 15C11 15.4142 10.6642 15.75 10.25 15.75H6.25C5.83579 15.75 5.5 15.4142 5.5 15Z" fill="currentColor" />
  </svg>
);

const TOKEN_ICON_PATHS: Record<string, string> = {
  USDT: "/img/coins/USDT.svg",
  USDC: "/img/coins/USDC.svg",
  ETH: "/img/coins/ETH.png",
  BTC: "/img/coins/BTC.png",
  BNB: "/img/coins/BNB.png",
  SOL: "/img/coins/SOL.png",
  MATIC: "/img/coins/MATIC.svg",
  TRX: "/img/deposit/tokens/trx.svg",
  XRP: "/img/deposit/tokens/xrp.svg",
  DOGE: "/img/deposit/tokens/doge.svg",
  LTC: "/img/deposit/tokens/ltc.svg",
  SHIB: "/img/deposit/tokens/shib.svg",
};

const CHAIN_ICON_PATHS: Record<string, string> = {
  bsc: "/img/coins/BNB.png",
  eth: "/img/coins/ETH.png",
  arbitrum: "/img/coins/ARB.png",
  optimism: "/img/coins/OP.png",
  base: "/img/coins/BASE.png",
  polygon: "/img/coins/MATIC.svg",
  solana: "/img/coins/SOL.png",
  bitcoin: "/img/coins/BTC.png",
  tron: "/img/deposit/tokens/trx.svg",
};

const TOKEN_VISUALS: Record<string, [string, string]> = {
  USDT: ["#26A17B", "T"],
  USDC: ["#2775CA", "C"],
  ETH: ["#627EEA", "\u039E"],
  BTC: ["#F7931A", "\u20BF"],
  BNB: ["#F0B90B", "B"],
  SOL: ["#9945FF", "S"],
  MATIC: ["#8247E5", "M"],
  TRX: ["#EC0928", "X"],
  TON: ["#0098EA", "T"],
  SUI: ["#4DA2FF", "S"],
};

const CHAIN_VISUALS: Record<string, [string, string]> = {
  bsc: ["#F0B90B", "B"],
  eth: ["#627EEA", "\u039E"],
  polygon: ["#8247E5", "P"],
  arbitrum: ["#28A0F0", "A"],
  optimism: ["#FF0420", "O"],
  base: ["#0052FF", "B"],
  solana: ["#9945FF", "S"],
  tron: ["#EC0928", "T"],
  bitcoin: ["#F7931A", "\u20BF"],
  ton: ["#0098EA", "T"],
  sui: ["#4DA2FF", "S"],
};

export const tokenIconPath = (symbol: string): string =>
  TOKEN_ICON_PATHS[symbol.toUpperCase()] ?? `/img/coins/${symbol.toUpperCase()}.png`;

export const chainIconPath = (chainId: string): string | null => CHAIN_ICON_PATHS[chainId] ?? null;

export const hasTokenIcon = (symbol: string): boolean => symbol.toUpperCase() in TOKEN_ICON_PATHS;

export const hasChainIcon = (chainId: string): boolean => chainId in CHAIN_ICON_PATHS;

export const needsChainBadge = (chainId: string, symbol: string): boolean => {
  const chain = chainIconPath(chainId);
  return chain !== null && chain !== tokenIconPath(symbol);
};

function RemoteIcon({
  path,
  visual,
  size,
  alt = "",
  className,
}: {
  path: string | null;
  visual: [string, string];
  size: number;
  alt?: string;
  className?: string;
}) {
  const ui = usePayUi();
  const [failed, setFailed] = useState(false);
  if (!path || failed) {
    return (
      <span
        aria-hidden="true"
        className={className}
        data-binodex-pay="icon-fallback"
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: size,
          height: size,
          borderRadius: "50%",
          background: visual[0],
          color: "#ffffff",
          fontSize: Math.round(size * 0.5),
          fontWeight: 700,
          lineHeight: 1,
          flexShrink: 0,
        }}
      >
        {visual[1]}
      </span>
    );
  }
  return (
    <img
      src={`${ui.assetBaseUrl}${path}`}
      alt={alt}
      width={size}
      height={size}
      className={className}
      referrerPolicy="no-referrer"
      loading="lazy"
      onError={() => setFailed(true)}
      style={{ borderRadius: "50%", objectFit: "contain", flexShrink: 0 }}
    />
  );
}

export function TokenIcon({ symbol, size = 18, className, alt }: IconProps & { symbol: string; alt?: string }) {
  const upper = symbol.toUpperCase();
  return (
    <RemoteIcon
      key={upper}
      path={tokenIconPath(upper)}
      visual={TOKEN_VISUALS[upper] ?? ["#2A3550", upper.charAt(0)]}
      size={size}
      alt={alt}
      className={className}
    />
  );
}

export function ChainIcon({ chainId, size = 18, className, alt }: IconProps & { chainId: string; alt?: string }) {
  return (
    <RemoteIcon
      key={chainId}
      path={chainIconPath(chainId)}
      visual={CHAIN_VISUALS[chainId] ?? ["#2A3550", chainId.charAt(0).toUpperCase()]}
      size={size}
      alt={alt}
      className={className}
    />
  );
}

export function BadgeIcon({ badge, className }: { badge: "qr" | "pdf"; className?: string }) {
  const ui = usePayUi();
  return (
    <img
      className={className}
      src={`${ui.assetBaseUrl}/img/badges/${badge}.svg`}
      alt=""
      aria-hidden="true"
      referrerPolicy="no-referrer"
    />
  );
}

export const CRYPTO_STACK = ["USDT", "USDC", "BTC", "ETH", "SOL", "BNB", "MATIC"] as const;
