import { LIMITS } from "./engine.js?v=20260713-life1";

export const RLE_LIMITS = Object.freeze({
  maxTextLength: 100000,
  maxPatternWidth: LIMITS.maxWidth,
  maxPatternHeight: LIMITS.maxHeight,
  maxPatternCells: LIMITS.maxCells,
});

function validatePatternDimensions(width, height) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new RangeError("RLE width and height must be positive integers.");
  }
  if (
    width > RLE_LIMITS.maxPatternWidth ||
    height > RLE_LIMITS.maxPatternHeight ||
    width * height > RLE_LIMITS.maxPatternCells
  ) {
    throw new RangeError("RLE pattern exceeds the board safety limits.");
  }
}

function normalizedRule(rule) {
  return rule.toUpperCase().replaceAll(" ", "");
}

export function parseRLE(text) {
  if (typeof text !== "string" || text.length === 0) {
    throw new TypeError("Paste a non-empty RLE pattern.");
  }
  if (text.length > RLE_LIMITS.maxTextLength) {
    throw new RangeError("RLE input is too large.");
  }

  const lines = text.replaceAll("\r", "").split("\n");
  const headerIndex = lines.findIndex((line) => {
    const trimmed = line.trim();
    return trimmed !== "" && !trimmed.startsWith("#");
  });
  if (headerIndex < 0) throw new SyntaxError("RLE header is missing.");

  const header = lines[headerIndex].trim();
  const match = header.match(
    /^x\s*=\s*(\d+)\s*,\s*y\s*=\s*(\d+)(?:\s*,\s*rule\s*=\s*([^,]+))?\s*$/i,
  );
  if (!match) throw new SyntaxError("RLE header must declare x and y.");
  const width = Number(match[1]);
  const height = Number(match[2]);
  validatePatternDimensions(width, height);
  const rule = match[3] ? normalizedRule(match[3]) : "B3/S23";
  if (rule !== "B3/S23" && rule !== "S23/B3" && rule !== "23/3") {
    throw new RangeError("Only Conway’s B3/S23 rule is supported.");
  }

  const body = lines
    .slice(headerIndex + 1)
    .filter((line) => !line.trimStart().startsWith("#"))
    .join("")
    .replace(/\s/g, "");
  if (!body) throw new SyntaxError("RLE body is missing.");

  const live = [];
  let x = 0;
  let y = 0;
  let countText = "";
  let ended = false;

  for (let index = 0; index < body.length; index += 1) {
    const token = body[index];
    if (/\d/.test(token)) {
      countText += token;
      if (countText.length > 6) throw new RangeError("An RLE run is unreasonably large.");
      continue;
    }

    const count = countText === "" ? 1 : Number(countText);
    countText = "";
    if (!Number.isSafeInteger(count) || count < 1) {
      throw new SyntaxError("RLE run lengths must be positive integers.");
    }

    if (token === "b" || token === "o") {
      if (ended) throw new SyntaxError("RLE contains data after its terminator.");
      if (y >= height || x + count > width) {
        throw new RangeError("RLE data extends beyond its declared dimensions.");
      }
      if (token === "o") {
        for (let offset = 0; offset < count; offset += 1) live.push([x + offset, y]);
      }
      x += count;
    } else if (token === "$") {
      if (ended) throw new SyntaxError("RLE contains data after its terminator.");
      y += count;
      x = 0;
      if (y > height) throw new RangeError("RLE has too many rows.");
    } else if (token === "!") {
      if (count !== 1) throw new SyntaxError("The RLE terminator cannot have a run length.");
      if (index !== body.length - 1) throw new SyntaxError("RLE contains data after its terminator.");
      ended = true;
    } else {
      throw new SyntaxError(`Unexpected RLE token “${token}”.`);
    }
  }

  if (countText) throw new SyntaxError("RLE ends with an incomplete run length.");
  if (!ended) throw new SyntaxError("RLE must end with !.");
  return { width, height, rule: "B3/S23", live };
}

function encodeRow(cells, width, y) {
  let lastAlive = -1;
  for (let x = width - 1; x >= 0; x -= 1) {
    if (cells[y * width + x]) {
      lastAlive = x;
      break;
    }
  }
  if (lastAlive < 0) return "";

  let encoded = "";
  let current = cells[y * width] ? "o" : "b";
  let run = 0;
  for (let x = 0; x <= lastAlive; x += 1) {
    const token = cells[y * width + x] ? "o" : "b";
    if (token === current) run += 1;
    else {
      encoded += `${run > 1 ? run : ""}${current}`;
      current = token;
      run = 1;
    }
  }
  encoded += `${run > 1 ? run : ""}${current}`;
  return encoded;
}

function wrapBody(body, width = 70) {
  const lines = [];
  for (let index = 0; index < body.length; index += width) {
    lines.push(body.slice(index, index + width));
  }
  return lines.join("\n");
}

export function exportRLE({ width, height, cells }, { name = "Conway’s Life Lab pattern" } = {}) {
  validatePatternDimensions(width, height);
  if (!(cells instanceof Uint8Array) || cells.length !== width * height) {
    throw new TypeError("RLE export requires a correctly sized Uint8Array.");
  }
  const rows = [];
  for (let y = 0; y < height; y += 1) rows.push(encodeRow(cells, width, y));
  const body = `${rows.join("$")}!`;
  const safeName = String(name).replace(/[\r\n]/g, " ").slice(0, 80);
  return `#N ${safeName}\n#C Exported by Conway’s Life Lab\nx = ${width}, y = ${height}, rule = B3/S23\n${wrapBody(body)}\n`;
}

export function patternCells(pattern, width = pattern.width, height = pattern.height, options = {}) {
  validatePatternDimensions(width, height);
  const cells = new Uint8Array(width * height);
  const offsetX = options.offsetX ?? Math.floor((width - pattern.width) / 2);
  const offsetY = options.offsetY ?? Math.floor((height - pattern.height) / 2);
  for (const [patternX, patternY] of pattern.live) {
    const x = patternX + offsetX;
    const y = patternY + offsetY;
    if (x >= 0 && y >= 0 && x < width && y < height) cells[y * width + x] = 1;
  }
  return cells;
}

const BUILTIN_COORDINATES = {
  block: {
    name: "Block",
    description: "A four-cell still life.",
    width: 2,
    height: 2,
    live: [[0, 0], [1, 0], [0, 1], [1, 1]],
  },
  blinker: {
    name: "Blinker",
    description: "The smallest oscillator, with period 2.",
    width: 3,
    height: 1,
    live: [[0, 0], [1, 0], [2, 0]],
  },
  glider: {
    name: "Glider",
    description: "A five-cell spaceship that moves diagonally.",
    width: 3,
    height: 3,
    live: [[1, 0], [2, 1], [0, 2], [1, 2], [2, 2]],
  },
  pulsar: {
    name: "Pulsar",
    description: "A large, symmetric period-3 oscillator.",
    width: 13,
    height: 13,
    live: [
      [2, 0], [3, 0], [4, 0], [8, 0], [9, 0], [10, 0],
      [0, 2], [5, 2], [7, 2], [12, 2],
      [0, 3], [5, 3], [7, 3], [12, 3],
      [0, 4], [5, 4], [7, 4], [12, 4],
      [2, 5], [3, 5], [4, 5], [8, 5], [9, 5], [10, 5],
      [2, 7], [3, 7], [4, 7], [8, 7], [9, 7], [10, 7],
      [0, 8], [5, 8], [7, 8], [12, 8],
      [0, 9], [5, 9], [7, 9], [12, 9],
      [0, 10], [5, 10], [7, 10], [12, 10],
      [2, 12], [3, 12], [4, 12], [8, 12], [9, 12], [10, 12],
    ],
  },
  gun: {
    name: "Gosper glider gun",
    description: "A period-30 machine that repeatedly launches gliders.",
    width: 36,
    height: 9,
    live: [
      [24, 0], [22, 1], [24, 1],
      [12, 2], [13, 2], [20, 2], [21, 2], [34, 2], [35, 2],
      [11, 3], [15, 3], [20, 3], [21, 3], [34, 3], [35, 3],
      [0, 4], [1, 4], [10, 4], [16, 4], [20, 4], [21, 4],
      [0, 5], [1, 5], [10, 5], [14, 5], [16, 5], [17, 5], [22, 5], [24, 5],
      [10, 6], [16, 6], [24, 6], [11, 7], [15, 7], [12, 8], [13, 8],
    ],
  },
};

export const BUILTIN_PATTERNS = Object.freeze(
  Object.fromEntries(
    Object.entries(BUILTIN_COORDINATES).map(([key, pattern]) => [
      key,
      Object.freeze({ ...pattern, live: Object.freeze(pattern.live.map((cell) => Object.freeze(cell))) }),
    ]),
  ),
);
