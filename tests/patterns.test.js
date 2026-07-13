import test from "node:test";
import assert from "node:assert/strict";

import { BUILTIN_PATTERNS, exportRLE, parseRLE, patternCells } from "../public/js/patterns.js";

test("all curated patterns fit their declarations", () => {
  const expectedPopulations = { block: 4, blinker: 3, glider: 5, pulsar: 48, gun: 36 };
  for (const [key, pattern] of Object.entries(BUILTIN_PATTERNS)) {
    assert.equal(pattern.live.length, expectedPopulations[key]);
    for (const [x, y] of pattern.live) {
      assert.ok(x >= 0 && x < pattern.width, `${key} x coordinate`);
      assert.ok(y >= 0 && y < pattern.height, `${key} y coordinate`);
    }
  }
});

test("RLE parses comments, whitespace, counts, and Conway rule variants", () => {
  const pattern = parseRLE(`#N glider\n#C comment\nx = 3, y = 3, rule = B3/S23\nbo$2bo$3o!\n`);
  assert.deepEqual(pattern, {
    width: 3,
    height: 3,
    rule: "B3/S23",
    live: [[1, 0], [2, 1], [0, 2], [1, 2], [2, 2]],
  });
  assert.equal(parseRLE("x=2,y=2,rule=23/3\n2o$2o!").live.length, 4);
});

test("RLE export round-trips exact board dimensions and cells", () => {
  const cells = patternCells(BUILTIN_PATTERNS.pulsar, 30, 20);
  const encoded = exportRLE({ width: 30, height: 20, cells }, { name: "Pulsar" });
  const parsed = parseRLE(encoded);
  const decoded = patternCells(parsed, parsed.width, parsed.height, { offsetX: 0, offsetY: 0 });
  assert.equal(parsed.width, 30);
  assert.equal(parsed.height, 20);
  assert.deepEqual(decoded, cells);
});

test("RLE rejects unsupported rules and malformed or oversized data", () => {
  assert.throws(() => parseRLE("x=3,y=3,rule=B36/S23\n3o!"), /Only Conway/);
  assert.throws(() => parseRLE("x=3,y=3\n4o!"), /dimensions/);
  assert.throws(() => parseRLE("x=3,y=3\n3o"), /end with/);
  assert.throws(() => parseRLE("x=3,y=3\n0o!"), /positive/);
  assert.throws(() => parseRLE("x=181,y=8\n!"), /safety/);
  assert.throws(() => parseRLE("x=3,y=3\n3o!o"), /after/);
  assert.throws(() => parseRLE("x=3,y=3\n3q!"), /Unexpected/);
});

test("pattern placement clips cleanly when a stamp crosses an edge", () => {
  const cells = patternCells(BUILTIN_PATTERNS.glider, 8, 8, { offsetX: -1, offsetY: -1 });
  assert.equal(cells.reduce((sum, value) => sum + value, 0), 3);
});
