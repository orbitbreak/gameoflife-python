import { LifeEngine, LIMITS, createClassicSoup, gridLineCells } from "./engine.js?v=20260713-life1";
import { BUILTIN_PATTERNS, exportRLE, parseRLE, patternCells } from "./patterns.js?v=20260713-life1";
import { RecurrenceDetector, TimeMachine, describeRecurrence } from "./history.js?v=20260713-life1";
import { copyTextWithFallback, decodeShareState, encodeShareState, shareInvalidationTarget } from "./share.js?v=20260713-life1";

const element = (id) => {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing required interface element #${id}.`);
  return found;
};

const ui = {
  canvas: element("life-canvas"),
  canvasFrame: element("canvas-frame"),
  canvasSummary: element("canvas-summary"),
  graph: element("population-graph"),
  play: element("play-button"),
  step: element("step-button"),
  undo: element("undo-button"),
  speed: element("speed-input"),
  speedOutput: element("speed-output"),
  runState: element("run-state"),
  headingGeneration: element("heading-generation"),
  statGeneration: element("stat-generation"),
  statPopulation: element("stat-population"),
  statBirths: element("stat-births"),
  statDeaths: element("stat-deaths"),
  statTopology: element("stat-topology"),
  timeline: element("timeline-input"),
  timelinePosition: element("timeline-position"),
  timelineLabel: element("timeline-label"),
  recurrence: element("recurrence-status"),
  width: element("width-input"),
  height: element("height-input"),
  topology: element("topology-select"),
  newBoard: element("new-board-button"),
  clear: element("clear-button"),
  showAge: element("age-checkbox"),
  seed: element("seed-input"),
  density: element("density-input"),
  densityOutput: element("density-output"),
  randomize: element("randomize-button"),
  pattern: element("pattern-select"),
  patternDescription: element("pattern-description"),
  loadPattern: element("load-pattern-button"),
  microscopeCoordinate: element("microscope-coordinate"),
  microscopeState: element("microscope-state"),
  microscopeReason: element("microscope-reason"),
  neighborDots: element("neighbor-dots"),
  rle: element("rle-input"),
  importRLE: element("import-button"),
  exportRLE: element("export-button"),
  share: element("share-button"),
  shareOutput: element("share-output"),
  toast: element("toast"),
};

const timeMachine = new TimeMachine(240);
const detector = new RecurrenceDetector(360);
let engine;
let playing = false;
let recurrenceEvent = null;
let selection = { x: 36, y: 22 };
let drawing = false;
let drawChanged = false;
let drawAlive = true;
let lastDrawCell = null;
let toastTimer = 0;
let accumulator = 0;
let previousFrame = performance.now();

function loadInitialEngine() {
  if (location.hash.startsWith("#life=")) {
    try {
      const shared = decodeShareState(location.hash);
      const loaded = LifeEngine.fromCells(shared.width, shared.height, shared.cells, { wrap: shared.wrap });
      loaded.generation = shared.generation;
      loaded.lastStats = { births: null, deaths: null, survivors: null, population: loaded.population };
      return { engine: loaded, label: "Shared pattern", notice: "Loaded the pattern from this link." };
    } catch (error) {
      return {
        engine: createClassicSoup(),
        label: "Classic Soup",
        error: `The share link was not loaded: ${error.message}`,
      };
    }
  }
  return { engine: createClassicSoup(), label: "Classic Soup" };
}

function invalidateShareLink() {
  ui.shareOutput.value = "";
  const target = shareInvalidationTarget(location);
  if (target !== null) window.history.replaceState(null, "", target);
}

function showToast(message, error = false) {
  clearTimeout(toastTimer);
  ui.toast.textContent = message;
  ui.toast.classList.toggle("error", error);
  ui.toast.classList.add("visible");
  toastTimer = window.setTimeout(() => ui.toast.classList.remove("visible"), 3600);
}

function setPlaying(next) {
  playing = Boolean(next);
  accumulator = 0;
  ui.play.setAttribute("aria-pressed", String(playing));
  ui.play.innerHTML = playing
    ? '<span aria-hidden="true">Ⅱ</span> Pause'
    : '<span aria-hidden="true">▶</span> Play';
  ui.runState.textContent = playing ? "Running" : "Paused";
  ui.runState.classList.toggle("running", playing);
}

function pause() {
  if (playing) setPlaying(false);
}

function observeBeginning() {
  detector.reset();
  if (engine.population > 0) {
    detector.observe(engine.cells, engine.width, engine.height, engine.generation, { wrap: engine.wrap });
  }
  recurrenceEvent = null;
}

function resetHistory(label) {
  timeMachine.reset(engine.snapshot(label), label);
  observeBeginning();
}

function recordEdit(label) {
  timeMachine.push(engine.snapshot(label), label);
  observeBeginning();
  render();
}

function syncSetupFields() {
  ui.width.value = String(engine.width);
  ui.height.value = String(engine.height);
  ui.topology.value = engine.wrap ? "wrap" : "finite";
  selection.x = Math.max(0, Math.min(engine.width - 1, selection.x));
  selection.y = Math.max(0, Math.min(engine.height - 1, selection.y));
}

function cellColor(age) {
  if (!ui.showAge.checked || age <= 1) return "#67e8b4";
  const strength = Math.min(1, Math.log2(age + 1) / 7);
  const red = Math.round(103 + (190 - 103) * strength);
  const green = Math.round(232 + (255 - 232) * strength);
  const blue = Math.round(180 + (221 - 180) * strength);
  return `rgb(${red} ${green} ${blue})`;
}

function canvasMetrics() {
  const cssWidth = Math.max(1, ui.canvasFrame.clientWidth || ui.canvasFrame.getBoundingClientRect().width);
  const naturalHeight = cssWidth * (engine.height / engine.width);
  const cssHeight = Math.max(120, Math.min(760, naturalHeight));
  const dpr = Math.min(2.5, window.devicePixelRatio || 1);
  const pixelWidth = Math.max(1, Math.round(cssWidth * dpr));
  const pixelHeight = Math.max(1, Math.round(cssHeight * dpr));
  if (ui.canvas.width !== pixelWidth || ui.canvas.height !== pixelHeight) {
    ui.canvas.width = pixelWidth;
    ui.canvas.height = pixelHeight;
    ui.canvas.style.height = `${cssHeight}px`;
  }
  return { cssWidth, cssHeight, dpr, cellWidth: cssWidth / engine.width, cellHeight: cssHeight / engine.height };
}

function drawCanvas() {
  const context = ui.canvas.getContext("2d", { alpha: false });
  const metrics = canvasMetrics();
  context.setTransform(metrics.dpr, 0, 0, metrics.dpr, 0, 0);
  context.fillStyle = "#030807";
  context.fillRect(0, 0, metrics.cssWidth, metrics.cssHeight);

  const neighbors = new Set(
    engine.neighborCoordinates(selection.x, selection.y).map(({ x, y }) => y * engine.width + x),
  );
  context.fillStyle = "rgb(247 200 115 / 10%)";
  for (const index of neighbors) {
    const x = index % engine.width;
    const y = Math.floor(index / engine.width);
    context.fillRect(x * metrics.cellWidth, y * metrics.cellHeight, metrics.cellWidth, metrics.cellHeight);
  }

  const inset = Math.min(1.25, Math.max(0.25, Math.min(metrics.cellWidth, metrics.cellHeight) * 0.08));
  for (let index = 0; index < engine.cells.length; index += 1) {
    if (engine.cells[index] !== 1) continue;
    const x = index % engine.width;
    const y = Math.floor(index / engine.width);
    context.fillStyle = cellColor(engine.ages[index]);
    context.fillRect(
      x * metrics.cellWidth + inset,
      y * metrics.cellHeight + inset,
      Math.max(0.6, metrics.cellWidth - inset * 2),
      Math.max(0.6, metrics.cellHeight - inset * 2),
    );
  }

  if (Math.min(metrics.cellWidth, metrics.cellHeight) >= 4) {
    context.beginPath();
    context.strokeStyle = "rgb(75 113 103 / 30%)";
    context.lineWidth = 0.65;
    for (let x = 1; x < engine.width; x += 1) {
      const position = x * metrics.cellWidth;
      context.moveTo(position, 0);
      context.lineTo(position, metrics.cssHeight);
    }
    for (let y = 1; y < engine.height; y += 1) {
      const position = y * metrics.cellHeight;
      context.moveTo(0, position);
      context.lineTo(metrics.cssWidth, position);
    }
    context.stroke();
  }

  context.strokeStyle = "#f7c873";
  context.lineWidth = 2;
  context.strokeRect(
    selection.x * metrics.cellWidth + 1,
    selection.y * metrics.cellHeight + 1,
    Math.max(1, metrics.cellWidth - 2),
    Math.max(1, metrics.cellHeight - 2),
  );
}

function drawPopulationGraph() {
  const context = ui.graph.getContext("2d");
  const cssWidth = Math.max(240, ui.graph.clientWidth || 640);
  const cssHeight = 96;
  const dpr = Math.min(2.5, window.devicePixelRatio || 1);
  ui.graph.width = Math.round(cssWidth * dpr);
  ui.graph.height = Math.round(cssHeight * dpr);
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.clearRect(0, 0, cssWidth, cssHeight);
  context.fillStyle = "#07110f";
  context.fillRect(0, 0, cssWidth, cssHeight);

  const series = timeMachine.populationSeries();
  const maximum = Math.max(1, ...series.map((point) => point.population));
  context.beginPath();
  for (let index = 0; index < series.length; index += 1) {
    const x = series.length === 1 ? 0 : (index / (series.length - 1)) * (cssWidth - 2) + 1;
    const y = cssHeight - 8 - (series[index].population / maximum) * (cssHeight - 18);
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  }
  context.strokeStyle = "#67e8b4";
  context.lineWidth = 2;
  context.stroke();

  const currentX = series.length === 1 ? 1 : (timeMachine.index / (series.length - 1)) * (cssWidth - 2) + 1;
  context.beginPath();
  context.moveTo(currentX, 3);
  context.lineTo(currentX, cssHeight - 3);
  context.strokeStyle = "#f7c873";
  context.lineWidth = 1.5;
  context.stroke();
  ui.graph.setAttribute(
    "aria-label",
    `Population history for ${series.length} saved states. Maximum population ${maximum}.`,
  );
}

function updateMicroscope() {
  const fate = engine.fateAt(selection.x, selection.y);
  ui.microscopeCoordinate.textContent = `Column ${selection.x + 1} · row ${selection.y + 1}`;
  const now = fate.alive ? "Alive now" : "Empty now";
  const next = fate.nextAlive ? (fate.alive ? "survives" : "will be born") : (fate.alive ? "will die" : "remains empty");
  ui.microscopeState.textContent = `${now} → ${next}`;
  ui.microscopeReason.textContent = `It has ${fate.neighbors} living neighbor${fate.neighbors === 1 ? "" : "s"}: ${fate.reason}.`;

  ui.neighborDots.replaceChildren();
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      const dot = document.createElement("span");
      dot.className = "neighbor-dot";
      if (dx === 0 && dy === 0) dot.classList.add("center");
      else {
        let x = selection.x + dx;
        let y = selection.y + dy;
        if (engine.wrap) {
          x = (x + engine.width) % engine.width;
          y = (y + engine.height) % engine.height;
        }
        if (engine.index(x, y) < 0) dot.classList.add("outside");
        else if (engine.get(x, y)) dot.classList.add("alive");
      }
      ui.neighborDots.append(dot);
    }
  }
}

function updateTimeline() {
  ui.timeline.min = "0";
  ui.timeline.max = String(Math.max(0, timeMachine.length - 1));
  ui.timeline.value = String(Math.max(0, timeMachine.index));
  ui.timeline.disabled = timeMachine.length <= 1;
  ui.timelinePosition.value = `${timeMachine.index + 1} of ${timeMachine.length}`;
  const snapshot = timeMachine.snapshots[timeMachine.index];
  ui.timelineLabel.textContent = snapshot
    ? `${snapshot.label} · generation ${snapshot.generation}`
    : "No saved state";
  ui.undo.disabled = !timeMachine.canUndo;
  drawPopulationGraph();
}

function updateReadouts() {
  const stats = engine.lastStats;
  ui.headingGeneration.textContent = String(engine.generation);
  ui.statGeneration.textContent = String(engine.generation);
  ui.statPopulation.textContent = String(engine.population);
  ui.statBirths.textContent = Number.isInteger(stats.births) ? String(stats.births) : "—";
  ui.statDeaths.textContent = Number.isInteger(stats.deaths) ? String(stats.deaths) : "—";
  ui.statTopology.textContent = engine.wrap ? "Wrapping" : "Finite";
  ui.recurrence.textContent = describeRecurrence(recurrenceEvent);
  ui.canvasSummary.textContent =
    `Generation ${engine.generation}. ${engine.population} living cells. ` +
    `${engine.wrap ? "Wrapping" : "Finite"} edges. Cell cursor at column ${selection.x + 1}, row ${selection.y + 1}.`;
}

function render() {
  syncSetupFields();
  drawCanvas();
  updateMicroscope();
  updateReadouts();
  updateTimeline();
}

function advanceOne() {
  invalidateShareLink();
  engine.step();
  timeMachine.push(engine.snapshot(`Generation ${engine.generation}`), `Generation ${engine.generation}`);
  recurrenceEvent = detector.observe(
    engine.cells,
    engine.width,
    engine.height,
    engine.generation,
    { wrap: engine.wrap },
  );
  if (recurrenceEvent) {
    setPlaying(false);
    showToast(describeRecurrence(recurrenceEvent));
  }
  return recurrenceEvent;
}

function boardCellFromPointer(event) {
  const bounds = ui.canvas.getBoundingClientRect();
  return {
    x: Math.max(0, Math.min(engine.width - 1, Math.floor(((event.clientX - bounds.left) / bounds.width) * engine.width))),
    y: Math.max(0, Math.min(engine.height - 1, Math.floor(((event.clientY - bounds.top) / bounds.height) * engine.height))),
  };
}

function applyPointer(event) {
  const cell = boardCellFromPointer(event);
  selection = cell;
  for (const point of gridLineCells(lastDrawCell ?? cell, cell)) {
    drawChanged = engine.set(point.x, point.y, drawAlive) || drawChanged;
  }
  lastDrawCell = cell;
  drawCanvas();
  updateMicroscope();
  updateReadouts();
}

function finishDrawing() {
  if (!drawing) return;
  drawing = false;
  lastDrawCell = null;
  if (drawChanged) {
    invalidateShareLink();
    recordEdit(drawAlive ? "Drew cells" : "Erased cells");
  }
  drawChanged = false;
}

function replaceWithEmptyBoard() {
  const width = Number(ui.width.value);
  const height = Number(ui.height.value);
  try {
    engine = new LifeEngine(width, height, { wrap: ui.topology.value === "wrap" });
    invalidateShareLink();
    selection = { x: Math.floor(width / 2), y: Math.floor(height / 2) };
    pause();
    resetHistory("New empty world");
    render();
    showToast(`New ${width} by ${height} empty world, paused at generation zero.`);
  } catch (error) {
    showToast(error.message, true);
  }
}

function loadPattern(pattern) {
  const width = Math.max(engine.width, Math.min(LIMITS.maxWidth, pattern.width + 8));
  const height = Math.max(engine.height, Math.min(LIMITS.maxHeight, pattern.height + 8));
  const cells = patternCells(pattern, width, height);
  engine = LifeEngine.fromCells(width, height, cells, { wrap: engine.wrap });
  invalidateShareLink();
  selection = { x: Math.floor(width / 2), y: Math.floor(height / 2) };
  pause();
  resetHistory(`Loaded ${pattern.name}`);
  render();
  showToast(`${pattern.name} loaded at generation zero.`);
}

function importPattern() {
  try {
    const pattern = parseRLE(ui.rle.value);
    const width = Math.max(LIMITS.minWidth, pattern.width);
    const height = Math.max(LIMITS.minHeight, pattern.height);
    const cells = patternCells(pattern, width, height);
    engine = LifeEngine.fromCells(width, height, cells, { wrap: engine.wrap });
    invalidateShareLink();
    selection = { x: Math.floor(width / 2), y: Math.floor(height / 2) };
    pause();
    resetHistory("Imported RLE");
    render();
    showToast(`Imported ${pattern.live.length} living cells.`);
  } catch (error) {
    showToast(`RLE was not imported: ${error.message}`, true);
  }
}

async function copyShareLink() {
  let url;
  try {
    const fragment = encodeShareState(engine);
    url = `${location.origin}${location.pathname}${fragment}`;
    ui.shareOutput.value = url;
    window.history.replaceState(null, "", fragment);
  } catch (error) {
    showToast(`Share link was not created: ${error.message}`, true);
    return;
  }

  const copied = await copyTextWithFallback(url, {
    clipboard: navigator.clipboard,
    fallback: () => {
      ui.shareOutput.select();
      return document.execCommand("copy");
    },
  });
  if (copied) {
    showToast("Share link copied. It contains this board, not your Time Machine history.");
  } else {
    ui.shareOutput.focus();
    ui.shareOutput.select();
    showToast("Link ready—copy it manually from the selected field.");
  }
}

ui.play.addEventListener("click", () => setPlaying(!playing));
ui.step.addEventListener("click", () => {
  pause();
  const recognition = advanceOne();
  render();
  if (!recognition) showToast(`Generation ${engine.generation}. Population ${engine.population}.`);
});
ui.undo.addEventListener("click", () => {
  pause();
  const snapshot = timeMachine.back();
  if (!snapshot) return;
  invalidateShareLink();
  engine.restore(snapshot);
  observeBeginning();
  render();
  showToast(`Rewound to generation ${engine.generation}. Population ${engine.population}.`);
});
ui.speed.addEventListener("input", () => {
  ui.speedOutput.value = `${ui.speed.value} gen/s`;
});
ui.density.addEventListener("input", () => {
  ui.densityOutput.value = `${ui.density.value}%`;
});
ui.newBoard.addEventListener("click", replaceWithEmptyBoard);
ui.clear.addEventListener("click", () => {
  pause();
  invalidateShareLink();
  engine.clear();
  resetHistory("Cleared world");
  render();
  showToast("World cleared and returned to generation zero.");
});
ui.showAge.addEventListener("change", drawCanvas);
ui.topology.addEventListener("change", () => {
  pause();
  invalidateShareLink();
  engine.setTopology(ui.topology.value === "wrap");
  recordEdit(engine.wrap ? "Enabled wrapping edges" : "Enabled finite edges");
  showToast(engine.wrap ? "Edges now wrap around." : "Edges are now finite; outside cells are dead.");
});
ui.randomize.addEventListener("click", () => {
  pause();
  invalidateShareLink();
  engine.randomize(ui.seed.value || "life-lab", Number(ui.density.value) / 100);
  resetHistory(`Seeded soup “${(ui.seed.value || "life-lab").slice(0, 24)}”`);
  render();
  showToast(`Seeded soup ready at generation zero. Population ${engine.population}.`);
});
ui.pattern.addEventListener("change", () => {
  ui.patternDescription.textContent = BUILTIN_PATTERNS[ui.pattern.value].description;
});
ui.loadPattern.addEventListener("click", () => loadPattern(BUILTIN_PATTERNS[ui.pattern.value]));
ui.importRLE.addEventListener("click", importPattern);
ui.exportRLE.addEventListener("click", () => {
  ui.rle.value = exportRLE(engine, { name: `Life Lab generation ${engine.generation}` });
  ui.rle.focus();
  ui.rle.select();
  showToast("Current board exported as standard RLE.");
});
ui.share.addEventListener("click", copyShareLink);
ui.shareOutput.addEventListener("focus", () => ui.shareOutput.select());
ui.timeline.addEventListener("input", () => {
  pause();
  invalidateShareLink();
  const snapshot = timeMachine.goTo(Number(ui.timeline.value));
  engine.restore(snapshot);
  observeBeginning();
  render();
});

ui.canvas.addEventListener("pointerdown", (event) => {
  if (event.button !== 0 && event.pointerType !== "touch") return;
  event.preventDefault();
  pause();
  drawing = true;
  drawChanged = false;
  lastDrawCell = null;
  drawAlive = document.querySelector('input[name="draw-mode"]:checked')?.value !== "erase";
  ui.canvas.setPointerCapture(event.pointerId);
  applyPointer(event);
});
ui.canvas.addEventListener("pointermove", (event) => {
  if (!drawing) return;
  event.preventDefault();
  applyPointer(event);
});
ui.canvas.addEventListener("pointerup", finishDrawing);
ui.canvas.addEventListener("pointercancel", finishDrawing);
ui.canvas.addEventListener("contextmenu", (event) => event.preventDefault());
ui.canvas.addEventListener("keydown", (event) => {
  const moves = {
    ArrowLeft: [-1, 0],
    ArrowRight: [1, 0],
    ArrowUp: [0, -1],
    ArrowDown: [0, 1],
  };
  if (moves[event.key]) {
    event.preventDefault();
    const [dx, dy] = moves[event.key];
    selection.x = Math.max(0, Math.min(engine.width - 1, selection.x + dx));
    selection.y = Math.max(0, Math.min(engine.height - 1, selection.y + dy));
    drawCanvas();
    updateMicroscope();
    updateReadouts();
  } else if (event.key === " " || event.key === "Spacebar") {
    event.preventDefault();
    if (event.repeat) return;
    pause();
    invalidateShareLink();
    engine.toggle(selection.x, selection.y);
    recordEdit("Keyboard cell edit");
    showToast(`Cell ${selection.x + 1}, ${selection.y + 1} is now ${engine.get(selection.x, selection.y) ? "alive" : "empty"}. Population ${engine.population}.`);
  } else if (event.key === "Enter") {
    event.preventDefault();
    updateMicroscope();
    ui.canvasSummary.textContent = `${ui.microscopeCoordinate.textContent}. ${ui.microscopeState.textContent}. ${ui.microscopeReason.textContent}`;
    showToast(ui.canvasSummary.textContent);
  } else if (
    (event.key.toLowerCase() === "d" || event.key.toLowerCase() === "e") &&
    !event.ctrlKey && !event.altKey && !event.metaKey
  ) {
    event.preventDefault();
    const value = event.key.toLowerCase() === "d" ? "draw" : "erase";
    document.querySelector(`input[name="draw-mode"][value="${value}"]`).checked = true;
    showToast(`${value === "draw" ? "Draw" : "Erase"} mode selected.`);
  }
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden) pause();
});

function animationFrame(timestamp) {
  const elapsed = Math.min(250, timestamp - previousFrame);
  previousFrame = timestamp;
  if (playing) {
    accumulator += elapsed;
    const interval = 1000 / Number(ui.speed.value);
    let steps = 0;
    while (accumulator >= interval && playing && steps < 8) {
      accumulator -= interval;
      advanceOne();
      steps += 1;
    }
    if (steps > 0) render();
  }
  requestAnimationFrame(animationFrame);
}

const initial = loadInitialEngine();
engine = initial.engine;
selection = { x: Math.floor(engine.width / 2), y: Math.floor(engine.height / 2) };
resetHistory(initial.label);
syncSetupFields();
ui.speedOutput.value = `${ui.speed.value} gen/s`;
ui.densityOutput.value = `${ui.density.value}%`;
render();
if (initial.error) {
  invalidateShareLink();
  showToast(initial.error, true);
}
else if (initial.notice) showToast(initial.notice);

if ("ResizeObserver" in window) {
  new ResizeObserver(() => {
    drawCanvas();
    drawPopulationGraph();
  }).observe(ui.canvasFrame);
} else {
  window.addEventListener("resize", render, { passive: true });
}
requestAnimationFrame(animationFrame);
