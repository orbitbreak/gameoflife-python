import test from "node:test";
import assert from "node:assert/strict";

import { LifeEngine, LIMITS, createClassicSoup, gridLineCells, mulberry32, seedFromString } from "../public/js/engine.js";

test("fresh visits begin with the deterministic Classic Soup paused at generation zero", () => {
  const first = createClassicSoup();
  const second = createClassicSoup();
  assert.equal(first.width, 72);
  assert.equal(first.height, 44);
  assert.equal(first.generation, 0);
  assert.equal(first.population, 591);
  assert.deepEqual(first.cells, second.cells);
});

test("fast pointer segments rasterize every crossed grid cell", () => {
  assert.deepEqual(gridLineCells({ x: 1, y: 2 }, { x: 6, y: 2 }), [
    { x: 1, y: 2 }, { x: 2, y: 2 }, { x: 3, y: 2 },
    { x: 4, y: 2 }, { x: 5, y: 2 }, { x: 6, y: 2 },
  ]);
  const diagonal = gridLineCells({ x: 0, y: 0 }, { x: 3, y: 5 });
  assert.deepEqual(diagonal.at(0), { x: 0, y: 0 });
  assert.deepEqual(diagonal.at(-1), { x: 3, y: 5 });
  assert.equal(diagonal.length, 6);
});

test("dimensions are bounded", () => {
  assert.throws(() => new LifeEngine(7, 20), RangeError);
  assert.throws(() => new LifeEngine(20, 121), RangeError);
  assert.throws(() => new LifeEngine(180, 121), RangeError);
  assert.doesNotThrow(() => new LifeEngine(LIMITS.maxWidth, LIMITS.maxHeight));
});

test("finite and wrapping edges count different neighborhoods", () => {
  const finite = new LifeEngine(8, 8);
  const wrapping = new LifeEngine(8, 8, { wrap: true });
  for (const engine of [finite, wrapping]) {
    engine.set(7, 7, true);
    engine.set(7, 0, true);
    engine.set(0, 7, true);
  }
  assert.equal(finite.countNeighbors(0, 0), 0);
  assert.equal(wrapping.countNeighbors(0, 0), 3);
  wrapping.step();
  assert.equal(wrapping.get(0, 0), 1);
});

test("block is a still life with accurate statistics and ages", () => {
  const engine = new LifeEngine(8, 8);
  for (const [x, y] of [[3, 3], [4, 3], [3, 4], [4, 4]]) engine.set(x, y, true);
  const stats = engine.step();
  assert.deepEqual(stats, { births: 0, deaths: 0, survivors: 4, population: 4, generation: 1 });
  assert.equal(engine.ageAt(3, 3), 2);
  assert.equal(engine.population, 4);
});

test("blinker evolves synchronously with births and deaths", () => {
  const engine = new LifeEngine(8, 8);
  engine.set(2, 3, true);
  engine.set(3, 3, true);
  engine.set(4, 3, true);
  const first = engine.step();
  assert.equal(first.births, 2);
  assert.equal(first.deaths, 2);
  assert.deepEqual(
    [[3, 2], [3, 3], [3, 4]].map(([x, y]) => engine.get(x, y)),
    [1, 1, 1],
  );
  engine.step();
  assert.deepEqual(
    [[2, 3], [3, 3], [4, 3]].map(([x, y]) => engine.get(x, y)),
    [1, 1, 1],
  );
});

test("seeded random soup is deterministic and density is validated", () => {
  const first = new LifeEngine(30, 20);
  const second = new LifeEngine(30, 20);
  assert.equal(first.randomize("orchid", 0.31), seedFromString("orchid"));
  second.randomize("orchid", 0.31);
  assert.deepEqual(first.cells, second.cells);
  assert.equal(mulberry32(42)(), mulberry32(42)());
  assert.throws(() => first.randomize(1, 1.01), RangeError);
});

test("snapshots restore topology, generation, state, and independent bytes", () => {
  const engine = new LifeEngine(10, 9, { wrap: true });
  engine.set(2, 2, true);
  engine.step();
  const snapshot = engine.snapshot("saved");
  const before = snapshot.cells.slice();
  engine.randomize("different", 0.5);
  engine.restore(snapshot);
  assert.equal(engine.wrap, true);
  assert.equal(engine.generation, 1);
  assert.deepEqual(engine.cells, before);
  engine.cells[0] = engine.cells[0] ? 0 : 1;
  assert.deepEqual(snapshot.cells, before);
});

test("Cell Microscope fates use the canonical Life rules", () => {
  const engine = new LifeEngine(8, 8);
  engine.set(3, 2, true);
  engine.set(2, 3, true);
  engine.set(4, 3, true);
  assert.deepEqual(engine.fateAt(3, 3), {
    alive: false,
    neighbors: 3,
    nextAlive: true,
    reason: "birth: exactly three neighbors",
  });
  engine.set(3, 3, true);
  assert.match(engine.fateAt(3, 3).reason, /survival/);
});
