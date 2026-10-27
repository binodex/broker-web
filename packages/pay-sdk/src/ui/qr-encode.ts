export type QrEcc = "L" | "M" | "Q" | "H";

export interface QrMatrix {
  version: number;
  size: number;
  mask: number;
  ecc: QrEcc;
  modules: boolean[][];
}

const ECC_FORMAT_BITS: Record<QrEcc, number> = { L: 1, M: 0, Q: 3, H: 2 };

export const ECC_CODEWORDS_PER_BLOCK: Record<QrEcc, readonly number[]> = {
  L: [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  M: [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
  Q: [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  H: [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
};

export const NUM_ERROR_CORRECTION_BLOCKS: Record<QrEcc, readonly number[]> = {
  L: [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
  M: [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
  Q: [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
  H: [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81],
};

const bit = (value: number, index: number): boolean => ((value >>> index) & 1) !== 0;

export const numRawDataModules = (version: number): number => {
  let result = (16 * version + 128) * version + 64;
  if (version >= 2) {
    const numAlign = Math.floor(version / 7) + 2;
    result -= (25 * numAlign - 10) * numAlign - 55;
    if (version >= 7) result -= 36;
  }
  return result;
};

export const numDataCodewords = (version: number, ecc: QrEcc): number =>
  Math.floor(numRawDataModules(version) / 8) -
  (ECC_CODEWORDS_PER_BLOCK[ecc][version] as number) *
    (NUM_ERROR_CORRECTION_BLOCKS[ecc][version] as number);

export const alignmentPositions = (version: number): number[] => {
  if (version === 1) return [];
  const size = version * 4 + 17;
  const numAlign = Math.floor(version / 7) + 2;
  const step = Math.floor((version * 8 + numAlign * 3 + 5) / (numAlign * 4 - 4)) * 2;
  const result = [6];
  for (let pos = size - 7; result.length < numAlign; pos -= step) result.splice(1, 0, pos);
  return result;
};

export const gfMultiply = (x: number, y: number): number => {
  let z = 0;
  for (let i = 7; i >= 0; i -= 1) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z & 0xff;
};

const rsDivisor = (degree: number): number[] => {
  const result = new Array<number>(degree).fill(0);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i += 1) {
    for (let j = 0; j < degree; j += 1) {
      result[j] = gfMultiply(result[j] as number, root);
      if (j + 1 < degree) result[j] = (result[j] as number) ^ (result[j + 1] as number);
    }
    root = gfMultiply(root, 0x02);
  }
  return result;
};

const rsRemainder = (data: readonly number[], divisor: readonly number[]): number[] => {
  const result = new Array<number>(divisor.length).fill(0);
  for (const value of data) {
    const factor = value ^ (result.shift() as number);
    result.push(0);
    divisor.forEach((coefficient, index) => {
      result[index] = (result[index] as number) ^ gfMultiply(coefficient, factor);
    });
  }
  return result;
};

class Grid {
  readonly modules: boolean[][];
  readonly isFunction: boolean[][];

  constructor(readonly size: number) {
    this.modules = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
    this.isFunction = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  }

  setFunction(x: number, y: number, dark: boolean) {
    (this.modules[y] as boolean[])[x] = dark;
    (this.isFunction[y] as boolean[])[x] = true;
  }
}

const drawFinder = (grid: Grid, cx: number, cy: number) => {
  for (let dy = -4; dy <= 4; dy += 1) {
    for (let dx = -4; dx <= 4; dx += 1) {
      const distance = Math.max(Math.abs(dx), Math.abs(dy));
      const x = cx + dx;
      const y = cy + dy;
      if (x >= 0 && x < grid.size && y >= 0 && y < grid.size) {
        grid.setFunction(x, y, distance !== 2 && distance !== 4);
      }
    }
  }
};

const drawFormatBits = (grid: Grid, ecc: QrEcc, mask: number) => {
  const data = (ECC_FORMAT_BITS[ecc] << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i += 1) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  const bits = ((data << 10) | rem) ^ 0x5412;
  const size = grid.size;
  for (let i = 0; i <= 5; i += 1) grid.setFunction(8, i, bit(bits, i));
  grid.setFunction(8, 7, bit(bits, 6));
  grid.setFunction(8, 8, bit(bits, 7));
  grid.setFunction(7, 8, bit(bits, 8));
  for (let i = 9; i < 15; i += 1) grid.setFunction(14 - i, 8, bit(bits, i));
  for (let i = 0; i < 8; i += 1) grid.setFunction(size - 1 - i, 8, bit(bits, i));
  for (let i = 8; i < 15; i += 1) grid.setFunction(8, size - 15 + i, bit(bits, i));
  grid.setFunction(8, size - 8, true);
};

const drawVersion = (grid: Grid, version: number) => {
  if (version < 7) return;
  let rem = version;
  for (let i = 0; i < 12; i += 1) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
  const bits = (version << 12) | rem;
  for (let i = 0; i < 18; i += 1) {
    const dark = bit(bits, i);
    const a = grid.size - 11 + (i % 3);
    const b = Math.floor(i / 3);
    grid.setFunction(a, b, dark);
    grid.setFunction(b, a, dark);
  }
};

export const functionPatternGrid = (version: number, ecc: QrEcc = "M"): Grid => {
  const grid = new Grid(version * 4 + 17);
  const size = grid.size;
  for (let i = 0; i < size; i += 1) {
    grid.setFunction(6, i, i % 2 === 0);
    grid.setFunction(i, 6, i % 2 === 0);
  }
  drawFinder(grid, 3, 3);
  drawFinder(grid, size - 4, 3);
  drawFinder(grid, 3, size - 4);
  const positions = alignmentPositions(version);
  const last = positions.length - 1;
  positions.forEach((py, i) => {
    positions.forEach((px, j) => {
      if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) return;
      for (let dy = -2; dy <= 2; dy += 1) {
        for (let dx = -2; dx <= 2; dx += 1) {
          grid.setFunction(px + dx, py + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
        }
      }
    });
  });
  drawFormatBits(grid, ecc, 0);
  drawVersion(grid, version);
  return grid;
};

export const zigzagOrder = (grid: { size: number; isFunction: boolean[][] }): [number, number][] => {
  const order: [number, number][] = [];
  const size = grid.size;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert += 1) {
      for (let j = 0; j < 2; j += 1) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vert : vert;
        if (!(grid.isFunction[y] as boolean[])[x]) order.push([x, y]);
      }
    }
  }
  return order;
};

export const maskApplies = (mask: number, x: number, y: number): boolean => {
  switch (mask) {
    case 0:
      return (x + y) % 2 === 0;
    case 1:
      return y % 2 === 0;
    case 2:
      return x % 3 === 0;
    case 3:
      return (x + y) % 3 === 0;
    case 4:
      return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
    case 5:
      return ((x * y) % 2) + ((x * y) % 3) === 0;
    case 6:
      return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
    default:
      return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
  }
};

const FINDER_LIKE = ["10111010000", "00001011101"];

const penalty = (modules: boolean[][]): number => {
  const size = modules.length;
  let score = 0;
  const lines: string[] = [];
  for (let y = 0; y < size; y += 1) {
    lines.push((modules[y] as boolean[]).map((dark) => (dark ? "1" : "0")).join(""));
  }
  for (let x = 0; x < size; x += 1) {
    let column = "";
    for (let y = 0; y < size; y += 1) column += (modules[y] as boolean[])[x] ? "1" : "0";
    lines.push(column);
  }
  for (const line of lines) {
    let run = 1;
    for (let i = 1; i <= line.length; i += 1) {
      if (i < line.length && line[i] === line[i - 1]) {
        run += 1;
        continue;
      }
      if (run >= 5) score += 3 + (run - 5);
      run = 1;
    }
    const padded = `0000${line}0000`;
    for (const pattern of FINDER_LIKE) {
      for (let at = padded.indexOf(pattern); at !== -1; at = padded.indexOf(pattern, at + 1)) {
        score += 40;
      }
    }
  }
  let dark = 0;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const value = (modules[y] as boolean[])[x];
      if (value) dark += 1;
      if (
        x + 1 < size &&
        y + 1 < size &&
        value === (modules[y] as boolean[])[x + 1] &&
        value === (modules[y + 1] as boolean[])[x] &&
        value === (modules[y + 1] as boolean[])[x + 1]
      ) {
        score += 3;
      }
    }
  }
  const total = size * size;
  score += (Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1) * 10;
  return score;
};

const interleave = (data: readonly number[], version: number, ecc: QrEcc): number[] => {
  const numBlocks = NUM_ERROR_CORRECTION_BLOCKS[ecc][version] as number;
  const blockEccLen = ECC_CODEWORDS_PER_BLOCK[ecc][version] as number;
  const rawCodewords = Math.floor(numRawDataModules(version) / 8);
  const numShortBlocks = numBlocks - (rawCodewords % numBlocks);
  const shortBlockLen = Math.floor(rawCodewords / numBlocks);
  const divisor = rsDivisor(blockEccLen);
  const blocks: number[][] = [];
  for (let i = 0, k = 0; i < numBlocks; i += 1) {
    const length = shortBlockLen - blockEccLen + (i < numShortBlocks ? 0 : 1);
    const chunk = data.slice(k, k + length);
    k += length;
    const eccBytes = rsRemainder(chunk, divisor);
    if (i < numShortBlocks) chunk.push(0);
    blocks.push(chunk.concat(eccBytes));
  }
  const result: number[] = [];
  const width = (blocks[0] as number[]).length;
  for (let i = 0; i < width; i += 1) {
    blocks.forEach((block, j) => {
      if (i !== shortBlockLen - blockEccLen || j >= numShortBlocks) result.push(block[i] as number);
    });
  }
  return result;
};

export const encodeQr = (text: string, ecc: QrEcc = "M"): QrMatrix => {
  const bytes = Array.from(new TextEncoder().encode(text));
  let version = 1;
  for (; version <= 40; version += 1) {
    const countBits = version <= 9 ? 8 : 16;
    const usedBits = 4 + countBits + bytes.length * 8;
    if (bytes.length < 2 ** countBits && usedBits <= numDataCodewords(version, ecc) * 8) break;
  }
  if (version > 40) throw new RangeError("Data too long for a QR code");
  const capacityBits = numDataCodewords(version, ecc) * 8;
  const bits: number[] = [];
  const append = (value: number, length: number) => {
    for (let i = length - 1; i >= 0; i -= 1) bits.push((value >>> i) & 1);
  };
  append(0b0100, 4);
  append(bytes.length, version <= 9 ? 8 : 16);
  bytes.forEach((value) => append(value, 8));
  append(0, Math.min(4, capacityBits - bits.length));
  append(0, (8 - (bits.length % 8)) % 8);
  for (let pad = 0xec; bits.length < capacityBits; pad ^= 0xec ^ 0x11) append(pad, 8);
  const data: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let value = 0;
    for (let j = 0; j < 8; j += 1) value = (value << 1) | (bits[i + j] as number);
    data.push(value);
  }
  const codewords = interleave(data, version, ecc);
  const base = functionPatternGrid(version, ecc);
  const order = zigzagOrder(base);
  const placed = base.modules.map((row) => row.slice());
  order.forEach(([x, y], index) => {
    const byte = codewords[index >>> 3];
    (placed[y] as boolean[])[x] = byte !== undefined && ((byte >>> (7 - (index & 7))) & 1) === 1;
  });
  let best: { mask: number; modules: boolean[][]; score: number } | null = null;
  for (let mask = 0; mask < 8; mask += 1) {
    const grid = new Grid(base.size);
    for (let y = 0; y < base.size; y += 1) {
      for (let x = 0; x < base.size; x += 1) {
        const fixed = (base.isFunction[y] as boolean[])[x] as boolean;
        (grid.isFunction[y] as boolean[])[x] = fixed;
        const value = (placed[y] as boolean[])[x] as boolean;
        (grid.modules[y] as boolean[])[x] = fixed ? value : value !== maskApplies(mask, x, y);
      }
    }
    drawFormatBits(grid, ecc, mask);
    const score = penalty(grid.modules);
    if (!best || score < best.score) best = { mask, modules: grid.modules, score };
  }
  const chosen = best as { mask: number; modules: boolean[][] };
  return { version, size: base.size, mask: chosen.mask, ecc, modules: chosen.modules };
};

export const qrPath = (matrix: QrMatrix, quietZone = 4): string => {
  let path = "";
  matrix.modules.forEach((row, y) => {
    row.forEach((dark, x) => {
      if (dark) path += `M${x + quietZone} ${y + quietZone}h1v1h-1z`;
    });
  });
  return path;
};
