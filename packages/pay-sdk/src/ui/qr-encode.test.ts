import { describe, expect, it } from "vitest";
import {
  ECC_CODEWORDS_PER_BLOCK,
  NUM_ERROR_CORRECTION_BLOCKS,
  encodeQr,
  functionPatternGrid,
  gfMultiply,
  maskApplies,
  numRawDataModules,
  qrPath,
  zigzagOrder,
  type QrEcc,
  type QrMatrix,
} from "./qr-encode.js";

const FORMAT_ECC: Record<QrEcc, number> = { L: 1, M: 0, Q: 3, H: 2 };

const bchFormat = (ecc: QrEcc, mask: number): number => {
  const data = (FORMAT_ECC[ecc] << 3) | mask;
  let value = data << 10;
  const generator = 0b10100110111;
  for (let i = 14; i >= 10; i -= 1) {
    if ((value >>> i) & 1) value ^= generator << (i - 10);
  }
  return ((data << 10) | value) ^ 0b101010000010010;
};

const at = (matrix: QrMatrix, x: number, y: number): boolean =>
  (matrix.modules[y] as boolean[])[x] as boolean;

const readFormat = (matrix: QrMatrix): { ecc: QrEcc; mask: number } => {
  const bits: boolean[] = [];
  for (let i = 0; i <= 5; i += 1) bits.push(at(matrix, 8, i));
  bits.push(at(matrix, 8, 7), at(matrix, 8, 8), at(matrix, 7, 8));
  for (let i = 9; i < 15; i += 1) bits.push(at(matrix, 14 - i, 8));
  const value = bits.reduce((acc, dark, index) => acc | ((dark ? 1 : 0) << index), 0);
  for (const ecc of ["L", "M", "Q", "H"] as const) {
    for (let mask = 0; mask < 8; mask += 1) {
      if (bchFormat(ecc, mask) === value) return { ecc, mask };
    }
  }
  throw new Error("format bits do not decode");
};

const syndromesAreZero = (block: readonly number[], eccLength: number): boolean => {
  let root = 1;
  for (let k = 0; k < eccLength; k += 1) {
    let value = 0;
    for (const coefficient of block) value = gfMultiply(value, root) ^ coefficient;
    if (value !== 0) return false;
    root = gfMultiply(root, 2);
  }
  return true;
};

const decode = (matrix: QrMatrix): string => {
  const version = (matrix.size - 17) / 4;
  const { ecc, mask } = readFormat(matrix);
  const grid = functionPatternGrid(version, ecc);
  const order = zigzagOrder(grid);
  const rawCodewords = Math.floor(numRawDataModules(version) / 8);
  const codewords = new Array<number>(rawCodewords).fill(0);
  order.slice(0, rawCodewords * 8).forEach(([x, y], index) => {
    const dark = at(matrix, x, y) !== maskApplies(mask, x, y);
    if (dark) codewords[index >>> 3] = (codewords[index >>> 3] as number) | (1 << (7 - (index & 7)));
  });
  const numBlocks = NUM_ERROR_CORRECTION_BLOCKS[ecc][version] as number;
  const eccLength = ECC_CODEWORDS_PER_BLOCK[ecc][version] as number;
  const numShort = numBlocks - (rawCodewords % numBlocks);
  const shortLength = Math.floor(rawCodewords / numBlocks);
  const shortData = shortLength - eccLength;
  const blocks: number[][] = Array.from({ length: numBlocks }, () => []);
  let next = 0;
  for (let i = 0; i <= shortLength; i += 1) {
    for (let j = 0; j < numBlocks; j += 1) {
      if (i === shortData && j < numShort) continue;
      (blocks[j] as number[]).push(codewords[next] as number);
      next += 1;
    }
  }
  expect(next).toBe(rawCodewords);
  const data: number[] = [];
  blocks.forEach((block, j) => {
    expect(syndromesAreZero(block, eccLength)).toBe(true);
    data.push(...block.slice(0, j < numShort ? shortData : shortData + 1));
    expect(block.length).toBe(j < numShort ? shortLength : shortLength + 1);
  });
  const bits = data.flatMap((byte) => Array.from({ length: 8 }, (_, i) => (byte >>> (7 - i)) & 1));
  const read = (start: number, length: number) =>
    bits.slice(start, start + length).reduce((acc, value) => (acc << 1) | value, 0);
  expect(read(0, 4)).toBe(0b0100);
  const countBits = version <= 9 ? 8 : 16;
  const count = read(4, countBits);
  const bytes = Array.from({ length: count }, (_, i) => read(4 + countBits + i * 8, 8));
  return new TextDecoder().decode(new Uint8Array(bytes));
};

describe("encodeQr", () => {
  const samples = [
    "0x52908400098527886E0F7030069857D2E4169EE7",
    "TQn9Y2khEsLJW1ChVWFMSMeRDow5KcbLSE",
    "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq",
    "https://qr.nspk.ru/AS1000670LSS7DN18SJQDNP4B05KLJL2?type=01&bank=100000000111&sum=500000&cur=RUB&crc=AB75",
    "upi://pay?pa=merchant.test@okaxis&pn=Test%20Payee&am=1003.00&cu=INR",
    "Привет, мир",
    "x".repeat(400),
  ];

  it.each(samples)("round-trips %s through an independent check", (text) => {
    const matrix = encodeQr(text);
    expect(matrix.size).toBe(matrix.version * 4 + 17);
    expect(decode(matrix)).toBe(text);
  });

  it("draws the three finder patterns", () => {
    const matrix = encodeQr("finder");
    const corners: [number, number][] = [
      [0, 0],
      [matrix.size - 7, 0],
      [0, matrix.size - 7],
    ];
    for (const [ox, oy] of corners) {
      for (let y = 0; y < 7; y += 1) {
        for (let x = 0; x < 7; x += 1) {
          const ring = Math.max(Math.abs(x - 3), Math.abs(y - 3));
          expect(at(matrix, ox + x, oy + y)).toBe(ring !== 2);
        }
      }
    }
  });

  it("picks the smallest version that fits", () => {
    expect(encodeQr("a".repeat(14)).version).toBe(1);
    expect(encodeQr("a".repeat(15)).version).toBe(2);
    expect(encodeQr("a".repeat(400)).version).toBeGreaterThan(9);
  });

  it("works for every error correction level", () => {
    for (const ecc of ["L", "M", "Q", "H"] as const) {
      const matrix = encodeQr("level check 123", ecc);
      expect(matrix.ecc).toBe(ecc);
      expect(decode(matrix)).toBe("level check 123");
    }
  });

  it("renders an SVG path with a quiet zone", () => {
    const matrix = encodeQr("path");
    const path = qrPath(matrix);
    expect(path.startsWith("M4 4h1v1h-1z")).toBe(true);
    expect(path).not.toContain("M0 ");
  });

  it("rejects data that cannot fit", () => {
    expect(() => encodeQr("x".repeat(3000))).toThrow(RangeError);
  });
});
