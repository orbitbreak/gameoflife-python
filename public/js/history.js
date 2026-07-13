function copySnapshot(snapshot, label = snapshot.label ?? "Snapshot") {
  if (!(snapshot?.cells instanceof Uint8Array)) {
    throw new TypeError("Time Machine snapshots require Uint8Array cells.");
  }
  return {
    ...snapshot,
    label,
    lastStats: snapshot.lastStats ? { ...snapshot.lastStats } : undefined,
    cells: snapshot.cells.slice(),
    ages: snapshot.ages instanceof Uint16Array ? snapshot.ages.slice() : undefined,
  };
}

export class TimeMachine {
  constructor(limit = 240) {
    if (!Number.isInteger(limit) || limit < 2 || limit > 1000) {
      throw new RangeError("Time Machine capacity must be between 2 and 1000.");
    }
    this.limit = limit;
    this.snapshots = [];
    this.index = -1;
  }

  reset(snapshot, label = "Beginning") {
    this.snapshots = [copySnapshot(snapshot, label)];
    this.index = 0;
    return this.current();
  }

  push(snapshot, label = snapshot.label ?? "Step") {
    if (this.index < this.snapshots.length - 1) {
      this.snapshots.splice(this.index + 1);
    }
    this.snapshots.push(copySnapshot(snapshot, label));
    if (this.snapshots.length > this.limit) {
      const overflow = this.snapshots.length - this.limit;
      this.snapshots.splice(0, overflow);
    }
    this.index = this.snapshots.length - 1;
    return this.current();
  }

  current() {
    return this.index >= 0 ? copySnapshot(this.snapshots[this.index]) : null;
  }

  goTo(index) {
    if (!Number.isInteger(index) || index < 0 || index >= this.snapshots.length) {
      throw new RangeError("Time Machine position is unavailable.");
    }
    this.index = index;
    return this.current();
  }

  back() {
    if (this.index <= 0) return null;
    return this.goTo(this.index - 1);
  }

  forward() {
    if (this.index >= this.snapshots.length - 1) return null;
    return this.goTo(this.index + 1);
  }

  get canUndo() {
    return this.index > 0;
  }

  get canRedo() {
    return this.index >= 0 && this.index < this.snapshots.length - 1;
  }

  get length() {
    return this.snapshots.length;
  }

  populationSeries() {
    return this.snapshots.map((snapshot, index) => ({
      index,
      generation: snapshot.generation,
      population: snapshot.population,
      current: index === this.index,
    }));
  }
}

function signatures(cells, width) {
  const exact = [];
  const coordinates = [];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (let index = 0; index < cells.length; index += 1) {
    if (cells[index] !== 1) continue;
    const x = index % width;
    const y = Math.floor(index / width);
    exact.push(index);
    coordinates.push([x, y]);
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }

  if (exact.length === 0) {
    return { population: 0, exact: "", normalized: "", anchorX: 0, anchorY: 0 };
  }
  const relative = coordinates.map(([x, y]) => `${x - minX},${y - minY}`).join(";");
  return {
    population: exact.length,
    exact: exact.join(","),
    normalized: `${maxX - minX + 1}x${maxY - minY + 1}:${relative}`,
    anchorX: minX,
    anchorY: minY,
  };
}

export class RecurrenceDetector {
  constructor(limit = 360) {
    if (!Number.isInteger(limit) || limit < 4 || limit > 2000) {
      throw new RangeError("Recurrence history must be between 4 and 2000 states.");
    }
    this.limit = limit;
    this.reset();
  }

  reset() {
    this.exact = new Map();
    this.normalized = new Map();
    this.exactOrder = [];
    this.normalizedOrder = [];
  }

  remember(map, order, key, value) {
    if (map.has(key)) return;
    map.set(key, value);
    order.push(key);
    if (order.length > this.limit) map.delete(order.shift());
  }

  observe(cells, width, height, generation, { wrap = false } = {}) {
    if (!(cells instanceof Uint8Array) || cells.length !== width * height) {
      throw new TypeError("Recurrence detection requires a correctly sized board.");
    }
    if (!Number.isSafeInteger(generation) || generation < 0) {
      throw new RangeError("Generation must be a non-negative safe integer.");
    }
    const state = signatures(cells, width);
    if (state.population === 0) {
      return { type: "extinction", generation, population: 0 };
    }

    const previousExact = this.exact.get(state.exact);
    if (previousExact && previousExact.generation < generation) {
      const period = generation - previousExact.generation;
      const current = { generation, anchorX: state.anchorX, anchorY: state.anchorY };
      this.exact.set(state.exact, current);
      if (!wrap) this.normalized.set(state.normalized, current);
      return {
        type: period === 1 ? "still-life" : "oscillator",
        generation,
        firstGeneration: previousExact.generation,
        period,
        population: state.population,
      };
    }

    if (!wrap) {
      const previousShape = this.normalized.get(state.normalized);
      if (previousShape && previousShape.generation < generation) {
        const dx = state.anchorX - previousShape.anchorX;
        const dy = state.anchorY - previousShape.anchorY;
        if (dx !== 0 || dy !== 0) {
          const current = { generation, anchorX: state.anchorX, anchorY: state.anchorY };
          this.remember(this.exact, this.exactOrder, state.exact, current);
          this.normalized.set(state.normalized, current);
          return {
            type: "translated-recurrence",
            generation,
            firstGeneration: previousShape.generation,
            period: generation - previousShape.generation,
            dx,
            dy,
            population: state.population,
          };
        }
      }
    }

    const record = { generation, anchorX: state.anchorX, anchorY: state.anchorY };
    this.remember(this.exact, this.exactOrder, state.exact, record);
    if (!wrap) this.remember(this.normalized, this.normalizedOrder, state.normalized, record);
    return null;
  }
}

export function shouldPauseForRecurrence(event) {
  return Boolean(event && event.type !== "translated-recurrence");
}

export function describeRecurrence(event) {
  if (!event) return "No recurrence recognized yet.";
  if (event.type === "extinction") return `Extinction at generation ${event.generation}.`;
  if (event.type === "still-life") {
    return `Still life recognized at generation ${event.generation}; the board no longer changes.`;
  }
  if (event.type === "oscillator") {
    return `Oscillator recognized: period ${event.period}, repeating generation ${event.firstGeneration}.`;
  }
  if (event.type === "translated-recurrence") {
    const horizontal = event.dx === 0 ? "" : `${Math.abs(event.dx)} cell${Math.abs(event.dx) === 1 ? "" : "s"} ${event.dx > 0 ? "right" : "left"}`;
    const vertical = event.dy === 0 ? "" : `${Math.abs(event.dy)} cell${Math.abs(event.dy) === 1 ? "" : "s"} ${event.dy > 0 ? "down" : "up"}`;
    return `Moving recurrence recognized: period ${event.period}, shifted ${[horizontal, vertical].filter(Boolean).join(" and ")}. Simulation continues.`;
  }
  return "A recurrence was recognized.";
}
