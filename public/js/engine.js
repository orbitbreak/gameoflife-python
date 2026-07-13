export const LIMITS = Object.freeze({
  minWidth: 8,
  maxWidth: 180,
  minHeight: 8,
  maxHeight: 120,
  maxCells: 21600,
});

export const CLASSIC_SOUP = Object.freeze({
  width: 72,
  height: 44,
  seed: 997834349,
  density: 0.2,
});

export function assertDimensions(width, height) {
  if (!Number.isInteger(width) || !Number.isInteger(height)) {
    throw new TypeError("Board dimensions must be integers.");
  }
  if (
    width < LIMITS.minWidth ||
    width > LIMITS.maxWidth ||
    height < LIMITS.minHeight ||
    height > LIMITS.maxHeight ||
    width * height > LIMITS.maxCells
  ) {
    throw new RangeError(
      `Board must be ${LIMITS.minWidth}–${LIMITS.maxWidth} by ` +
        `${LIMITS.minHeight}–${LIMITS.maxHeight}, with at most ${LIMITS.maxCells} cells.`,
    );
  }
}

export function seedFromString(value) {
  const text = String(value);
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function gridLineCells(start, end) {
  for (const point of [start, end]) {
    if (!Number.isInteger(point?.x) || !Number.isInteger(point?.y)) {
      throw new TypeError("Grid-line endpoints require integer x and y coordinates.");
    }
  }
  const cells = [];
  let x = start.x;
  let y = start.y;
  const dx = Math.abs(end.x - start.x);
  const sx = start.x < end.x ? 1 : -1;
  const dy = -Math.abs(end.y - start.y);
  const sy = start.y < end.y ? 1 : -1;
  let error = dx + dy;
  while (true) {
    cells.push({ x, y });
    if (x === end.x && y === end.y) break;
    const doubled = 2 * error;
    if (doubled >= dy) {
      error += dy;
      x += sx;
    }
    if (doubled <= dx) {
      error += dx;
      y += sy;
    }
  }
  return cells;
}

function countPopulation(cells) {
  let population = 0;
  for (const cell of cells) population += cell === 1 ? 1 : 0;
  return population;
}

export class LifeEngine {
  constructor(width = 72, height = 44, { wrap = false } = {}) {
    assertDimensions(width, height);
    this.width = width;
    this.height = height;
    this.wrap = Boolean(wrap);
    this.cells = new Uint8Array(width * height);
    this.ages = new Uint16Array(width * height);
    this.nextCells = new Uint8Array(width * height);
    this.nextAges = new Uint16Array(width * height);
    this.population = 0;
    this.generation = 0;
    this.lastStats = { births: 0, deaths: 0, survivors: 0, population: 0 };
  }

  index(x, y) {
    if (!Number.isInteger(x) || !Number.isInteger(y)) return -1;
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return -1;
    return y * this.width + x;
  }

  coordinates(index) {
    if (!Number.isInteger(index) || index < 0 || index >= this.cells.length) {
      throw new RangeError("Cell index is outside the board.");
    }
    return { x: index % this.width, y: Math.floor(index / this.width) };
  }

  get(x, y) {
    const index = this.index(x, y);
    return index < 0 ? 0 : this.cells[index];
  }

  ageAt(x, y) {
    const index = this.index(x, y);
    return index < 0 ? 0 : this.ages[index];
  }

  set(x, y, alive) {
    const index = this.index(x, y);
    if (index < 0) return false;
    const value = alive ? 1 : 0;
    if (this.cells[index] === value) return false;
    this.population += value ? 1 : -1;
    this.cells[index] = value;
    this.ages[index] = value ? 1 : 0;
    this.lastStats = { births: 0, deaths: 0, survivors: this.population, population: this.population };
    return true;
  }

  toggle(x, y) {
    const index = this.index(x, y);
    if (index < 0) return false;
    this.set(x, y, this.cells[index] === 0);
    return true;
  }

  setTopology(wrap) {
    this.wrap = Boolean(wrap);
  }

  neighborCoordinates(x, y) {
    const neighbors = [];
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dy === 0) continue;
        let nx = x + dx;
        let ny = y + dy;
        if (this.wrap) {
          nx = (nx + this.width) % this.width;
          ny = (ny + this.height) % this.height;
        }
        if (this.index(nx, ny) >= 0) neighbors.push({ x: nx, y: ny });
      }
    }
    return neighbors;
  }

  countNeighbors(x, y) {
    let total = 0;
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dy === 0) continue;
        let nx = x + dx;
        let ny = y + dy;
        if (this.wrap) {
          nx = (nx + this.width) % this.width;
          ny = (ny + this.height) % this.height;
        }
        if (nx >= 0 && ny >= 0 && nx < this.width && ny < this.height) {
          total += this.cells[ny * this.width + nx];
        }
      }
    }
    return total;
  }

  fateAt(x, y) {
    const alive = this.get(x, y) === 1;
    const neighbors = this.countNeighbors(x, y);
    const nextAlive = neighbors === 3 || (alive && neighbors === 2);
    let reason;
    if (!alive && nextAlive) reason = "birth: exactly three neighbors";
    else if (alive && nextAlive) reason = "survival: two or three neighbors";
    else if (alive && neighbors < 2) reason = "death by isolation: fewer than two neighbors";
    else if (alive) reason = "death by crowding: more than three neighbors";
    else reason = "remains empty: birth needs exactly three neighbors";
    return { alive, neighbors, nextAlive, reason };
  }

  step() {
    let births = 0;
    let deaths = 0;
    let survivors = 0;
    const { width, height, cells, ages, nextCells, nextAges } = this;

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = y * width + x;
        const alive = cells[index] === 1;
        const neighbors = this.countNeighbors(x, y);
        const nextAlive = neighbors === 3 || (alive && neighbors === 2);
        nextCells[index] = nextAlive ? 1 : 0;
        if (nextAlive) {
          if (alive) {
            survivors += 1;
            nextAges[index] = Math.min(65535, ages[index] + 1);
          } else {
            births += 1;
            nextAges[index] = 1;
          }
        } else {
          if (alive) deaths += 1;
          nextAges[index] = 0;
        }
      }
    }

    this.cells = nextCells;
    this.nextCells = cells;
    this.ages = nextAges;
    this.nextAges = ages;
    this.nextCells.fill(0);
    this.nextAges.fill(0);
    this.population = births + survivors;
    this.generation += 1;
    this.lastStats = { births, deaths, survivors, population: this.population };
    return { ...this.lastStats, generation: this.generation };
  }

  clear({ resetGeneration = true } = {}) {
    this.cells.fill(0);
    this.ages.fill(0);
    this.nextCells.fill(0);
    this.nextAges.fill(0);
    this.population = 0;
    if (resetGeneration) this.generation = 0;
    this.lastStats = { births: 0, deaths: 0, survivors: 0, population: 0 };
  }

  randomize(seed, density = 0.2) {
    if (!Number.isFinite(density) || density < 0 || density > 1) {
      throw new RangeError("Density must be between 0 and 1.");
    }
    const numericSeed = typeof seed === "number" ? seed >>> 0 : seedFromString(seed);
    const random = mulberry32(numericSeed);
    this.population = 0;
    for (let index = 0; index < this.cells.length; index += 1) {
      const alive = random() < density ? 1 : 0;
      this.cells[index] = alive;
      this.ages[index] = alive;
      this.population += alive;
    }
    this.nextCells.fill(0);
    this.nextAges.fill(0);
    this.generation = 0;
    this.lastStats = { births: 0, deaths: 0, survivors: this.population, population: this.population };
    return numericSeed;
  }

  snapshot(label = "Snapshot") {
    return {
      width: this.width,
      height: this.height,
      wrap: this.wrap,
      generation: this.generation,
      population: this.population,
      lastStats: { ...this.lastStats },
      cells: this.cells.slice(),
      ages: this.ages.slice(),
      label,
    };
  }

  restore(snapshot) {
    assertDimensions(snapshot.width, snapshot.height);
    const expected = snapshot.width * snapshot.height;
    if (!(snapshot.cells instanceof Uint8Array) || snapshot.cells.length !== expected) {
      throw new TypeError("Snapshot cells are invalid.");
    }
    this.width = snapshot.width;
    this.height = snapshot.height;
    this.wrap = Boolean(snapshot.wrap);
    this.cells = snapshot.cells.slice();
    this.ages =
      snapshot.ages instanceof Uint16Array && snapshot.ages.length === expected
        ? snapshot.ages.slice()
        : Uint16Array.from(this.cells);
    this.nextCells = new Uint8Array(expected);
    this.nextAges = new Uint16Array(expected);
    this.population = countPopulation(this.cells);
    this.generation = Number.isSafeInteger(snapshot.generation) && snapshot.generation >= 0
      ? snapshot.generation
      : 0;
    this.lastStats = snapshot.lastStats
      ? { ...snapshot.lastStats, population: this.population }
      : { births: 0, deaths: 0, survivors: this.population, population: this.population };
  }

  static fromCells(width, height, cells, options = {}) {
    const engine = new LifeEngine(width, height, options);
    if (!(cells instanceof Uint8Array) || cells.length !== width * height) {
      throw new TypeError("Cells must be a correctly sized Uint8Array.");
    }
    engine.cells.set(cells);
    engine.ages.set(cells);
    engine.population = countPopulation(cells);
    engine.lastStats = {
      births: 0,
      deaths: 0,
      survivors: engine.population,
      population: engine.population,
    };
    return engine;
  }
}

export function createClassicSoup() {
  const engine = new LifeEngine(CLASSIC_SOUP.width, CLASSIC_SOUP.height);
  engine.randomize(CLASSIC_SOUP.seed, CLASSIC_SOUP.density);
  return engine;
}
