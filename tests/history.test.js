import test from "node:test";
import assert from "node:assert/strict";

import { LifeEngine } from "../public/js/engine.js";
import { BUILTIN_PATTERNS, patternCells } from "../public/js/patterns.js";
import { RecurrenceDetector, TimeMachine, describeRecurrence, shouldPauseForRecurrence } from "../public/js/history.js";

function engineWith(pattern, width = 30, height = 20) {
  return LifeEngine.fromCells(width, height, patternCells(pattern, width, height));
}

test("Time Machine caps snapshots, returns copies, and branches after scrubbing", () => {
  const engine = new LifeEngine(8, 8);
  const history = new TimeMachine(3);
  history.reset(engine.snapshot(), "zero");
  for (let generation = 1; generation <= 3; generation += 1) {
    engine.set(generation, 1, true);
    history.push(engine.snapshot(), `edit ${generation}`);
  }
  assert.equal(history.length, 3);
  assert.equal(history.current().label, "edit 3");
  const copy = history.current();
  copy.cells.fill(0);
  assert.notDeepEqual(copy.cells, history.current().cells);

  history.goTo(0);
  engine.restore(history.current());
  engine.set(7, 7, true);
  history.push(engine.snapshot(), "branch");
  assert.equal(history.length, 2);
  assert.equal(history.canRedo, false);
  assert.equal(history.current().label, "branch");
});

test("recurrence detector recognizes extinction and still life", () => {
  const empty = new LifeEngine(8, 8);
  const detector = new RecurrenceDetector();
  assert.equal(detector.observe(empty.cells, 8, 8, 0)?.type, "extinction");

  const block = engineWith(BUILTIN_PATTERNS.block);
  detector.reset();
  assert.equal(detector.observe(block.cells, block.width, block.height, 0), null);
  block.step();
  const event = detector.observe(block.cells, block.width, block.height, 1);
  assert.equal(event.type, "still-life");
  assert.equal(event.period, 1);
  assert.match(describeRecurrence(event), /Still life/);
  block.step();
  const repeated = detector.observe(block.cells, block.width, block.height, 2);
  assert.equal(repeated.type, "still-life");
  assert.equal(repeated.period, 1);
});

test("recurrence detector finds an exact oscillator period", () => {
  const blinker = engineWith(BUILTIN_PATTERNS.blinker);
  const detector = new RecurrenceDetector();
  detector.observe(blinker.cells, blinker.width, blinker.height, 0);
  blinker.step();
  assert.equal(detector.observe(blinker.cells, blinker.width, blinker.height, 1), null);
  blinker.step();
  const event = detector.observe(blinker.cells, blinker.width, blinker.height, 2);
  assert.deepEqual(
    { type: event.type, period: event.period, first: event.firstGeneration },
    { type: "oscillator", period: 2, first: 0 },
  );
  blinker.step();
  const repeated = detector.observe(blinker.cells, blinker.width, blinker.height, 3);
  assert.equal(repeated.type, "oscillator");
  assert.equal(repeated.period, 2);
});

test("recurrence detector recognizes glider translation", () => {
  const glider = engineWith(BUILTIN_PATTERNS.glider);
  const detector = new RecurrenceDetector();
  detector.observe(glider.cells, glider.width, glider.height, 0);
  let event = null;
  for (let generation = 1; generation <= 4; generation += 1) {
    glider.step();
    event = detector.observe(glider.cells, glider.width, glider.height, generation);
  }
  assert.deepEqual(
    { type: event.type, period: event.period, dx: event.dx, dy: event.dy },
    { type: "translated-recurrence", period: 4, dx: 1, dy: 1 },
  );
  assert.equal(shouldPauseForRecurrence(event), false);
  assert.match(describeRecurrence(event), /Simulation continues\./);
  for (let generation = 5; generation <= 8; generation += 1) {
    glider.step();
    event = detector.observe(glider.cells, glider.width, glider.height, generation);
    assert.equal(event.type, "translated-recurrence");
    assert.equal(event.period, 4);
  }
});

test("only moving recurrence leaves playback running", () => {
  assert.equal(shouldPauseForRecurrence(null), false);
  assert.equal(shouldPauseForRecurrence({ type: "translated-recurrence" }), false);
  assert.equal(shouldPauseForRecurrence({ type: "extinction" }), true);
  assert.equal(shouldPauseForRecurrence({ type: "still-life" }), true);
  assert.equal(shouldPauseForRecurrence({ type: "oscillator" }), true);
});

test("wrapping boards do not report ambiguous translated recurrence", () => {
  const glider = engineWith(BUILTIN_PATTERNS.glider);
  glider.setTopology(true);
  const detector = new RecurrenceDetector();
  detector.observe(glider.cells, glider.width, glider.height, 0, { wrap: true });
  let event = null;
  for (let generation = 1; generation <= 4; generation += 1) {
    glider.step();
    event = detector.observe(glider.cells, glider.width, glider.height, generation, { wrap: true });
  }
  assert.equal(event, null);
});
