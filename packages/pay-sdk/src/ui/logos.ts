export interface MethodLogo {
  imgPath: string | null;
  initial: string;
  background: string;
  color: string;
  badge?: "qr" | "pdf";
}

const logo = (
  imgPath: string | null,
  initial: string,
  background: string,
  color = "#FFFFFF",
  badge?: "qr" | "pdf",
): MethodLogo => (badge ? { imgPath, initial, background, color, badge } : { imgPath, initial, background, color });

export const METHOD_LOGOS: Record<string, MethodLogo> = {
  tinkoff: logo("/img/banks/tinkoff.webp", "Т", "#FFDD2D", "#000000"),
  sberbank: logo("/img/banks/sberbank.webp", "С", "#21A038"),
  sber_qr: logo("/img/banks/sberbank.webp", "С", "#21A038", "#FFFFFF", "qr"),
  alfa: logo("/img/banks/alfa.webp", "А", "#EF3124"),
  otp: logo("/img/banks/otp.webp", "О", "#52AE30"),
  psb: logo("/img/banks/psb.webp", "П", "#F58220"),
  gazprom: logo("/img/banks/gazprom.webp", "Г", "#0079C1"),
  yoomoney: logo("/img/banks/yoomoney.webp", "Ю", "#8B3FFD"),
  vtb_qr: logo("/img/banks/vtb.webp", "В", "#009FDF", "#FFFFFF", "qr"),
  vtb_transgran: logo("/img/banks/vtb.webp", "В", "#009FDF"),
  sbp: logo("/img/banks/sbp.webp", "С", "#00A0E3", "#FFFFFF", "pdf"),
  nspk: logo("/img/banks/sbp.webp", "С", "#00A0E3", "#FFFFFF", "qr"),
  c2c: logo("/img/banks/cards.png", "#", "#2E3A59", "#FFFFFF", "pdf"),
  trans_mezhbank: logo("/img/banks/trans_mezhbank.webp", "М", "#3A4A6B"),
  trans_sbp: logo("/img/banks/trans_sbp.webp", "С", "#00A0E3"),
  p2p: logo("/img/banks/cards.png", "₴", "#2E3A59"),
  qr_mono: logo("/img/banks/monobank.webp", "M", "#000000", "#FFFFFF", "qr"),
  qr_privat: logo("/img/banks/privatbank.webp", "П", "#61A60E", "#FFFFFF", "qr"),
  quasi: logo("/img/banks/cards.png", "#", "#2E3A59"),
  alfa_qr: logo("/img/banks/alfa.webp", "А", "#EF3124", "#FFFFFF", "qr"),
  ozon_qr: logo("/img/banks/ozon.webp", "O", "#005BFF", "#FFFFFF", "qr"),
  any_qr: logo("/img/badges/qr.svg", "QR", "#2E3A59", "#FFFFFF", "pdf"),
  trans_tj: logo("/img/banks/cards.png", "ТГ", "#3A4A6B"),
  alfa_transgran: logo("/img/banks/alfa.webp", "А", "#EF3124", "#FFFFFF", "pdf"),
  m2_c2c_kz: logo("/img/banks/cards.png", "₸", "#2E3A59"),
  upi: logo("/img/deposit-bank/banks/in/imps.svg", "₹", "#FFFFFF", "#097939"),
};

export const FALLBACK_LOGO: MethodLogo = logo(null, "?", "#475271");

export const getMethodLogo = (methodId: string): MethodLogo => METHOD_LOGOS[methodId] ?? FALLBACK_LOGO;

export const assetUrl = (base: string, path: string): string => `${base}${path}`;

export const COUNTRY_CODES = [
  "AD","AE","AF","AI","AL","AM","AO","AR","AT","AU","AW","AZ","BA",
  "BB","BD","BE","BG","BH","BM","BN","BO","BR","BS","BT","BY","BZ",
  "CA","CD","CH","CI","CK","CL","CN","CO","CR","CU","CV","CY","CZ",
  "DE","DK","DM","DO","DZ","EC","EE","EG","ES","ET","FI","FO","FR",
  "GA","GB","GE","GG","GH","GI","GL","GP","GR","GT","GU","GY","HK",
  "HN","HR","HU","ID","IE","IL","IM","IN","IQ","IR","IS","IT","JE",
  "JM","JO","JP","KE","KG","KH","KR","KW","KY","KZ","LA","LB","LC",
  "LI","LK","LT","LU","LV","LY","MA","MC","MD","ME","MG","MK","ML",
  "MM","MN","MO","MP","MQ","MR","MT","MU","MV","MW","MX","MY","MZ",
  "NA","NC","NG","NI","NL","NO","NP","NZ","OM","PA","PE","PF","PH",
  "PK","PL","PM","PR","PS","PT","PW","PY","QA","RE","RO","RS","RU",
  "RW","SA","SC","SD","SE","SG","SI","SK","SL","SM","SN","SR","ST",
  "SV","SX","SY","SZ","TG","TH","TJ","TM","TN","TR","TT","TW","TZ",
  "UA","US","UY","UZ","VC","VE","VI","VN","XK","YT","ZA","ZM","ZW",
] as const;

const LEGACY_FLAG_FILES: Record<string, string> = {
  DE: "de",
  FR: "fr",
  IN: "hi",
  RU: "ru",
  SA: "sa",
  ES: "sp",
  TR: "tr",
  UA: "ua",
  US: "us",
};

export const countryFlagPath = (code: string): string =>
  `/img/trade/flags/${LEGACY_FLAG_FILES[code] ?? code.toLowerCase()}.svg`;

export const isSupportedCountry = (code: string): boolean =>
  (COUNTRY_CODES as readonly string[]).includes(code.toUpperCase());
