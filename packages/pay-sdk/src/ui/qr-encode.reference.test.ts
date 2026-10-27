import jsQRModule from "jsqr";
import QRCode from "qrcode";
import { describe, expect, it } from "vitest";
import { encodeQr, type QrEcc, type QrMatrix } from "./qr-encode.js";

type Decode = typeof jsQRModule.default;
// jsqr is CommonJS: under NodeNext the default import is the module object.
const jsQR: Decode = (jsQRModule as unknown as { default?: Decode }).default ?? (jsQRModule as unknown as Decode);

const PAYLOADS: Record<string, string> = {
  evm: "0x52908400098527886E0F7030069857D2E4169EE7",
  evmUri: "ethereum:0x52908400098527886E0F7030069857D2E4169EE7@56/transfer?address=0xdAC17F958D2ee523a2206206994597C13D831ec7&uint256=1e6",
  tron: "TXkaMxjBxzgrV1DC3pCLUxFFxKVf22mzx",
  btc: "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq",
  btcUri: "bitcoin:BC1QAR0SRRR7XFKVY5L643LYDNW9RE59GTZZWF5MDQ?amount=0.00125&label=Deposit",
  sol: "7EcDhSYGxXyscszYEp35KHN8vvw3svAuLKTzXwCFLtV",
  solMemo: "solana:7EcDhSYGxXyscszYEp35KHN8vvw3svAuLKTzXwCFLtV?memo=bp-4417-%D0%BF%D0%BE%D0%BF%D0%BE%D0%BB%D0%BD%D0%B5%D0%BD%D0%B8%D0%B5",
  tonMemo: "ton://transfer/UQBvW8Z5huBkMJYdnfAEM5JqTNkuWX3diqYENkWsIL0XggGG?text=memo%20123456789",
  xrpTag: "rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe?dt=4294967295",
  unicode: "Пополнение · 入金 · ✓",
  long: `0x52908400098527886E0F7030069857D2E4169EE7?memo=${"a1B2c3D4".repeat(30)}`,
};

const LEVELS: QrEcc[] = ["L", "M", "Q", "H"];

const toImage = (matrix: QrMatrix, scale = 4, quiet = 4) => {
  const side = (matrix.size + quiet * 2) * scale;
  const data = new Uint8ClampedArray(side * side * 4).fill(255);
  matrix.modules.forEach((row, y) =>
    row.forEach((dark, x) => {
      if (!dark) return;
      for (let dy = 0; dy < scale; dy += 1) {
        for (let dx = 0; dx < scale; dx += 1) {
          const offset = (((y + quiet) * scale + dy) * side + (x + quiet) * scale + dx) * 4;
          data[offset] = 0;
          data[offset + 1] = 0;
          data[offset + 2] = 0;
        }
      }
    }),
  );
  return { data, side };
};

const referenceModules = (text: string, matrix: QrMatrix): boolean[][] => {
  const code = QRCode.create([{ data: new TextEncoder().encode(text), mode: "byte" }], {
    errorCorrectionLevel: matrix.ecc,
    version: matrix.version,
    maskPattern: matrix.mask as QRCode.QRCodeMaskPattern,
  });
  const size = code.modules.size;
  return Array.from({ length: size }, (_, y) =>
    Array.from({ length: size }, (_, x) => code.modules.get(y, x) === 1),
  );
};

describe("encodeQr against independent implementations", () => {
  describe.each(Object.entries(PAYLOADS))("%s", (_, text) => {
    it.each(LEVELS)("level %s decodes with jsQR to the exact payload", (ecc) => {
      const matrix = encodeQr(text, ecc);
      const { data, side } = toImage(matrix);
      const decoded = jsQR(data, side, side, { inversionAttempts: "dontInvert" });
      expect(decoded?.data).toBe(text);
      expect(decoded?.version).toBe(matrix.version);
    });

    it.each(LEVELS)("level %s matches the qrcode package module for module", (ecc) => {
      const matrix = encodeQr(text, ecc);
      expect(matrix.modules).toEqual(referenceModules(text, matrix));
    });
  });

  it("covers version information (v7+) at level H", () => {
    expect(encodeQr(PAYLOADS.long as string, "H").version).toBeGreaterThanOrEqual(7);
  });
});
