import test from "node:test";
import assert from "node:assert/strict";

import { LifeEngine } from "../public/js/engine.js";
import { BUILTIN_PATTERNS, patternCells } from "../public/js/patterns.js";
import { SHARE_LIMITS, copyTextWithFallback, decodeShareState, encodeShareState, shareInvalidationTarget } from "../public/js/share.js";

test("clipboard denial falls back without discarding a ready link", async () => {
  let fallbackText = "";
  const copied = await copyTextWithFallback("https://example.test/#life=1", {
    clipboard: { writeText: async () => { throw new Error("denied"); } },
    fallback: (text) => {
      fallbackText = text;
      return true;
    },
  });
  assert.equal(copied, true);
  assert.equal(fallbackText, "https://example.test/#life=1");
  assert.equal(
    await copyTextWithFallback("ready", {
      clipboard: { writeText: async () => { throw new Error("denied"); } },
      fallback: () => false,
    }),
    false,
  );
});

test("Life hashes are invalidated to the current path while unrelated hashes survive", () => {
  assert.equal(
    shareInvalidationTarget({ pathname: "/gameoflife/", search: "?demo=1", hash: "#life=broken" }),
    "/gameoflife/?demo=1",
  );
  assert.equal(
    shareInvalidationTarget({ pathname: "/gameoflife/", search: "", hash: "#guide" }),
    null,
  );
});

test("share fragments round-trip cells, dimensions, topology, and generation", () => {
  const cells = patternCells(BUILTIN_PATTERNS.gun, 72, 44);
  const fragment = encodeShareState({ width: 72, height: 44, wrap: true, generation: 30, cells });
  const decoded = decodeShareState(fragment);
  assert.equal(decoded.width, 72);
  assert.equal(decoded.height, 44);
  assert.equal(decoded.wrap, true);
  assert.equal(decoded.generation, 30);
  assert.deepEqual(decoded.cells, cells);
});

test("empty and dense ordinary boards remain shareable", () => {
  const empty = new LifeEngine(72, 44);
  assert.ok(encodeShareState(empty).length < SHARE_LIMITS.maxFragmentLength);
  empty.randomize("soup", 0.2);
  assert.ok(encodeShareState(empty).length < SHARE_LIMITS.maxFragmentLength);
});

test("share decoding rejects malformed, repeated, unknown, and oversized values", () => {
  const engine = new LifeEngine(8, 8);
  const valid = encodeShareState(engine);
  assert.throws(() => decodeShareState(valid.replace("life=1", "life=2")), /version/);
  assert.throws(() => decodeShareState(`${valid}&w=8`), /repeated/);
  assert.throws(() => decodeShareState(`${valid}&surprise=yes`), /Unexpected/);
  assert.throws(() => decodeShareState(`#${"x".repeat(SHARE_LIMITS.maxFragmentLength)}`), /large/);
  assert.throws(() => decodeShareState("#life=1"), /missing/);
});

test("share encoding rejects invalid cells and excessive generation", () => {
  assert.throws(
    () => encodeShareState({ width: 8, height: 8, cells: new Uint8Array(3) }),
    /correctly sized/,
  );
  assert.throws(
    () => encodeShareState({ width: 8, height: 8, cells: new Uint8Array(64), generation: 1e12 }),
    /Generation/,
  );
});
