import { assertDimensions } from "./engine.js?v=20260713-life1";
import { exportRLE, parseRLE, patternCells } from "./patterns.js?v=20260713-life1";

export const SHARE_LIMITS = Object.freeze({
  maxFragmentLength: 16000,
  maxGeneration: 1000000000,
});

export function shareInvalidationTarget({ pathname = "", search = "", hash = "" }) {
  return hash.startsWith("#life=") ? `${pathname}${search}` : null;
}

export async function copyTextWithFallback(
  text,
  { clipboard = globalThis.navigator?.clipboard, fallback = () => false } = {},
) {
  if (clipboard?.writeText) {
    try {
      await clipboard.writeText(text);
      return true;
    } catch {
      // A denied Clipboard API should still offer the selected-field fallback.
    }
  }
  try {
    return Boolean(await fallback(text));
  } catch {
    return false;
  }
}

function integerParameter(value, name, maximum) {
  if (typeof value !== "string" || !/^\d+$/.test(value)) {
    throw new SyntaxError(`Share value “${name}” must be a non-negative integer.`);
  }
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number > maximum) {
    throw new RangeError(`Share value “${name}” is outside its allowed range.`);
  }
  return number;
}

export function encodeShareState({ width, height, wrap = false, generation = 0, cells }) {
  assertDimensions(width, height);
  if (!(cells instanceof Uint8Array) || cells.length !== width * height) {
    throw new TypeError("Sharing requires a correctly sized Uint8Array.");
  }
  if (!Number.isSafeInteger(generation) || generation < 0 || generation > SHARE_LIMITS.maxGeneration) {
    throw new RangeError("Generation cannot be represented in a share link.");
  }
  const parameters = new URLSearchParams({
    life: "1",
    w: String(width),
    h: String(height),
    t: wrap ? "wrap" : "finite",
    g: String(generation),
    r: exportRLE({ width, height, cells }, { name: "Shared Life pattern" }),
  });
  const fragment = `#${parameters.toString()}`;
  if (fragment.length > SHARE_LIMITS.maxFragmentLength) {
    throw new RangeError("This board is too complex for a safe share link. Export its RLE instead.");
  }
  return fragment;
}

export function decodeShareState(fragment) {
  if (typeof fragment !== "string" || fragment.length === 0) {
    throw new TypeError("Share fragment is missing.");
  }
  if (fragment.length > SHARE_LIMITS.maxFragmentLength) {
    throw new RangeError("Share fragment is too large.");
  }
  const raw = fragment.startsWith("#") ? fragment.slice(1) : fragment;
  const parameters = new URLSearchParams(raw);
  const allowed = new Set(["life", "w", "h", "t", "g", "r"]);
  for (const key of parameters.keys()) {
    if (!allowed.has(key)) throw new SyntaxError(`Unexpected share value “${key}”.`);
  }
  for (const key of allowed) {
    if (parameters.getAll(key).length !== 1) throw new SyntaxError(`Share value “${key}” is missing or repeated.`);
  }
  if (parameters.get("life") !== "1") throw new RangeError("Unsupported share-link version.");
  const width = integerParameter(parameters.get("w"), "w", 10000);
  const height = integerParameter(parameters.get("h"), "h", 10000);
  assertDimensions(width, height);
  const topology = parameters.get("t");
  if (topology !== "finite" && topology !== "wrap") {
    throw new RangeError("Share topology must be finite or wrap.");
  }
  const generation = integerParameter(
    parameters.get("g"),
    "g",
    SHARE_LIMITS.maxGeneration,
  );
  const pattern = parseRLE(parameters.get("r"));
  if (pattern.width !== width || pattern.height !== height) {
    throw new RangeError("Share dimensions do not match its RLE pattern.");
  }
  return {
    width,
    height,
    wrap: topology === "wrap",
    generation,
    cells: patternCells(pattern, width, height, { offsetX: 0, offsetY: 0 }),
  };
}
