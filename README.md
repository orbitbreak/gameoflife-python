# Conway’s Life Lab

An interactive, framework-free web laboratory for Conway’s Game of Life. Draw a
seed, inspect why any cell will live or die, rewind its evolution, recognize
recurring structures, and exchange standard RLE patterns—all in the browser.

The original minimalist Python 2/Pygame program is preserved byte-for-byte in
[`legacy/original/`](legacy/original/).

## Run locally

Serve the repository’s `public/` directory with any static web server:

```sh
python3 -m http.server 8000 --directory public
```

Then open <http://localhost:8000>. No build, install, network request, account,
tracking, service worker, or audio is involved.

## Test

Node 18 or newer is sufficient; the project has no package dependencies.

```sh
npm test
# or, when npm is unavailable
node --test
```

## Public boundary

Only `public/` is deployable. Tests, package metadata, documentation, Git data,
and `legacy/` are intentionally outside the website payload.

## Features

- A typed-array Life engine with finite and wrapping topologies
- Paused generation zero, deterministic seeded soup, drawing, erasing, undo,
  stepping, and adjustable playback
- High-DPI responsive canvas plus a keyboard cell cursor and live summaries
- Cell Microscope explanations with selected-cell and neighbor highlighting
- A capped branching Time Machine with a population graph
- Extinction, still-life, oscillator, and translated-recurrence recognition
- Block, blinker, glider, pulsar, and Gosper glider-gun starters
- Strict standard RLE import/export and bounded URL-fragment sharing

## Legacy note

The 2012-era source remains intentionally unmodernized. It documents the tiny
Pygame sketch from which this browser lab grew; the browser implementation is
the maintained version.
