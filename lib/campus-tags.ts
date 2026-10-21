export type CampusTagUrlRow = {
  tagId: string;
  nfcUrl: string;
  qrUrl: string;
};

const DEFAULT_PUBLIC_ORIGIN = 'https://avocadomini.si';

function origin(value: string | undefined) {
  try {
    const parsed = new URL(value || DEFAULT_PUBLIC_ORIGIN);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password)
      throw new Error('invalid origin');
    return parsed.origin;
  } catch {
    return DEFAULT_PUBLIC_ORIGIN;
  }
}

export function campusTagUrls(tagId: string, publicOrigin?: string): CampusTagUrlRow {
  const base = `${origin(publicOrigin)}/t/${encodeURIComponent(tagId)}`;
  return {
    tagId,
    nfcUrl: base,
    qrUrl: `${base}?source=qr`,
  };
}

function csvCell(value: string) {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

export function campusTagCsv(rows: CampusTagUrlRow[]) {
  return [
    'tag_id,nfc_url,qr_url',
    ...rows.map((row) => [row.tagId, row.nfcUrl, row.qrUrl].map(csvCell).join(',')),
  ].join('\n') + '\n';
}

// Version 5-L carries every URL made from the Campus tag contract: a
// https://avocadomini.si/t/ prefix, a 64-character valid tag ID, and the
// ?source=qr suffix fit within its 106-byte byte-mode data capacity. Keeping
// one fixed version makes the export deterministic while avoiding a late QR
// generation failure after a tag batch has already been written to D1.
const QR_SIZE = 37;
const QR_DATA_CODEWORDS = 108;
const QR_ECC_CODEWORDS = 26;

function gfMul(a: number, b: number, log: Int16Array, exp: Uint8Array) {
  return a === 0 || b === 0 ? 0 : exp[(log[a] + log[b]) % 255];
}

function reedSolomon(data: number[]) {
  const log = new Int16Array(256);
  const exp = new Uint8Array(512);
  let value = 1;
  for (let index = 0; index < 255; index += 1) {
    exp[index] = value;
    log[value] = index;
    value <<= 1;
    if (value & 0x100) value ^= 0x11d;
  }
  for (let index = 255; index < 512; index += 1) exp[index] = exp[index - 255];
  const generator = [1];
  for (let index = 0; index < QR_ECC_CODEWORDS; index += 1) {
    const next = Array.from({ length: generator.length + 1 }, () => 0);
    for (let position = 0; position < generator.length; position += 1) {
      next[position] ^= generator[position];
      next[position + 1] ^= gfMul(generator[position], exp[index], log, exp);
    }
    generator.splice(0, generator.length, ...next);
  }
  const remainder = Array.from({ length: QR_ECC_CODEWORDS }, () => 0);
  for (const byte of data) {
    const factor = byte ^ remainder[0];
    remainder.shift();
    remainder.push(0);
    for (let index = 0; index < QR_ECC_CODEWORDS; index += 1)
      remainder[index] ^= gfMul(generator[index + 1], factor, log, exp);
  }
  return remainder;
}

function qrCodewords(value: string) {
  const bytes = [...new TextEncoder().encode(value)];
  if (bytes.length > 106) throw new Error('QR URL is too long for the card encoder.');
  const bits: number[] = [0, 1, 0, 0];
  for (let shift = 7; shift >= 0; shift -= 1) bits.push((bytes.length >>> shift) & 1);
  for (const byte of bytes) for (let shift = 7; shift >= 0; shift -= 1) bits.push((byte >>> shift) & 1);
  const capacity = QR_DATA_CODEWORDS * 8;
  for (let index = 0; index < Math.min(4, capacity - bits.length); index += 1) bits.push(0);
  while (bits.length % 8) bits.push(0);
  const data: number[] = [];
  for (let index = 0; index < bits.length; index += 8)
    data.push(bits.slice(index, index + 8).reduce((result, bit) => (result << 1) | bit, 0));
  let pad = 0;
  while (data.length < QR_DATA_CODEWORDS) data.push(pad++ % 2 === 0 ? 0xec : 0x11);
  return [...data, ...reedSolomon(data)];
}

type Matrix = { modules: boolean[][]; functionModules: boolean[][] };

function emptyMatrix(): Matrix {
  return {
    modules: Array.from({ length: QR_SIZE }, () => Array.from({ length: QR_SIZE }, () => false)),
    functionModules: Array.from({ length: QR_SIZE }, () => Array.from({ length: QR_SIZE }, () => false)),
  };
}

function setFunction(matrix: Matrix, x: number, y: number, value: boolean) {
  if (x >= 0 && y >= 0 && x < QR_SIZE && y < QR_SIZE) {
    matrix.modules[y][x] = value;
    matrix.functionModules[y][x] = true;
  }
}

function finder(matrix: Matrix, x: number, y: number) {
  for (let dy = -1; dy <= 7; dy += 1) {
    for (let dx = -1; dx <= 7; dx += 1) {
      const value = dx >= 0 && dx <= 6 && dy >= 0 && dy <= 6 && (dx === 0 || dx === 6 || dy === 0 || dy === 6 || (dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4));
      setFunction(matrix, x + dx, y + dy, value);
    }
  }
}

function setupFunctionPatterns(matrix: Matrix) {
  finder(matrix, 0, 0);
  finder(matrix, QR_SIZE - 7, 0);
  finder(matrix, 0, QR_SIZE - 7);
  for (let index = 8; index < QR_SIZE - 8; index += 1) {
    if (!matrix.functionModules[6][index]) setFunction(matrix, index, 6, index % 2 === 0);
    if (!matrix.functionModules[index][6]) setFunction(matrix, 6, index, index % 2 === 0);
  }
  // Version 5 has one alignment pattern at (30, 30); the other potential
  // positions overlap the three finder patterns.
  for (let dy = -2; dy <= 2; dy += 1)
    for (let dx = -2; dx <= 2; dx += 1)
      setFunction(matrix, QR_SIZE - 7 + dx, QR_SIZE - 7 + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  setFunction(matrix, 8, QR_SIZE - 8, true);
  // Reserve both format-information strips; setupFormat overwrites the bits.
  for (let index = 0; index < 15; index += 1) {
    const verticalY = index < 6 ? index : index < 8 ? index + 1 : QR_SIZE - 15 + index;
    const horizontalX = index < 8 ? QR_SIZE - index - 1 : index < 9 ? 15 - index : 14 - index;
    setFunction(matrix, 8, verticalY, false);
    setFunction(matrix, horizontalX, 8, false);
  }
}

function formatBits(mask: number) {
  const value = (1 << 3) | mask; // Error correction level L is binary 01.
  let remainder = value << 10;
  for (let bit = 14; bit >= 10; bit -= 1) if ((remainder >>> bit) & 1) remainder ^= 0x537 << (bit - 10);
  return ((value << 10) | remainder) ^ 0x5412;
}

function setupFormat(matrix: Matrix, mask: number) {
  const bits = formatBits(mask);
  for (let index = 0; index < 15; index += 1) {
    const bit = ((bits >>> index) & 1) !== 0;
    const verticalY = index < 6 ? index : index < 8 ? index + 1 : QR_SIZE - 15 + index;
    const horizontalX = index < 8 ? QR_SIZE - index - 1 : index < 9 ? 15 - index : 14 - index;
    matrix.modules[verticalY][8] = bit;
    matrix.modules[8][horizontalX] = bit;
  }
  matrix.modules[QR_SIZE - 8][8] = true;
}

function maskBit(mask: number, x: number, y: number) {
  switch (mask) {
    case 0: return (x + y) % 2 === 0;
    case 1: return y % 2 === 0;
    case 2: return x % 3 === 0;
    case 3: return (x + y) % 3 === 0;
    case 4: return (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0;
    case 5: return (x * y) % 2 + (x * y) % 3 === 0;
    case 6: return ((x * y) % 2 + (x * y) % 3) % 2 === 0;
    default: return ((x * y) % 3 + (x + y) % 2) % 2 === 0;
  }
}

function addData(matrix: Matrix, codewords: number[], mask: number) {
  let bitIndex = 0;
  let upward = true;
  for (let right = QR_SIZE - 1; right >= 1; right -= 2) {
    if (right === 6) right -= 1;
    for (let offset = 0; offset < QR_SIZE; offset += 1) {
      const y = upward ? QR_SIZE - 1 - offset : offset;
      for (const x of [right, right - 1]) {
        if (matrix.functionModules[y][x]) continue;
        const bit = bitIndex < codewords.length * 8 && ((codewords[bitIndex >>> 3] >>> (7 - (bitIndex & 7))) & 1) !== 0;
        matrix.modules[y][x] = maskBit(mask, x, y) ? !bit : bit;
        bitIndex += 1;
      }
    }
    upward = !upward;
  }
}

function penalty(matrix: Matrix) {
  let score = 0;
  const linePenalty = (line: boolean[]) => {
    let run = 1;
    for (let index = 1; index < line.length; index += 1) {
      if (line[index] === line[index - 1]) run += 1;
      else { if (run >= 5) score += 3 + run - 5; run = 1; }
    }
    if (run >= 5) score += 3 + run - 5;
  };
  for (let row = 0; row < QR_SIZE; row += 1) linePenalty(matrix.modules[row]);
  for (let column = 0; column < QR_SIZE; column += 1) linePenalty(matrix.modules.map((row) => row[column]));
  for (let row = 0; row < QR_SIZE - 1; row += 1) for (let column = 0; column < QR_SIZE - 1; column += 1) {
    const value = matrix.modules[row][column];
    if (matrix.modules[row][column + 1] === value && matrix.modules[row + 1][column] === value && matrix.modules[row + 1][column + 1] === value) score += 3;
  }
  for (let row = 0; row < QR_SIZE; row += 1) for (let column = 0; column <= QR_SIZE - 7; column += 1) {
    const pattern = matrix.modules[row].slice(column, column + 7).map(Number).join('');
    if (pattern === '1011101') score += 40;
  }
  for (let column = 0; column < QR_SIZE; column += 1) for (let row = 0; row <= QR_SIZE - 7; row += 1) {
    const pattern = matrix.modules.slice(row, row + 7).map((line) => Number(line[column])).join('');
    if (pattern === '1011101') score += 40;
  }
  let dark = 0;
  for (const row of matrix.modules) for (const value of row) if (value) dark += 1;
  score += Math.floor(Math.abs(dark * 20 - QR_SIZE * QR_SIZE * 10) / (QR_SIZE * QR_SIZE)) * 10;
  return score;
}

function qrMatrix(url: string) {
  const codewords = qrCodewords(url);
  let best: Matrix | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (let mask = 0; mask < 8; mask += 1) {
    const matrix = emptyMatrix();
    setupFunctionPatterns(matrix);
    addData(matrix, codewords, mask);
    setupFormat(matrix, mask);
    const score = penalty(matrix);
    if (score < bestScore) { best = matrix; bestScore = score; }
  }
  return best!;
}

export function campusTagQrSvg(url: string) {
  const matrix = qrMatrix(url);
  const scale = 8;
  const quiet = 4;
  const pixels = (QR_SIZE + quiet * 2) * scale;
  const escaped = url.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
  const modules: string[] = [];
  for (let row = 0; row < QR_SIZE; row += 1) for (let column = 0; column < QR_SIZE; column += 1)
    if (matrix.modules[row][column]) modules.push(`<rect x="${(column + quiet) * scale}" y="${(row + quiet) * scale}" width="${scale}" height="${scale}"/>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${pixels} ${pixels}" role="img" aria-label="QR code for ${escaped}" data-qr-url="${escaped}" shape-rendering="crispEdges"><metadata>${escaped}</metadata><rect width="100%" height="100%" fill="#fff"/><g fill="#000">${modules.join('')}</g></svg>`;
}
