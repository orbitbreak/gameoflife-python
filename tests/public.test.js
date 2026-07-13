import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, readFile, readdir } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const digest = async (path) => createHash("sha256").update(await readFile(new URL(`../${path}`, import.meta.url))).digest("hex");

async function listFiles(directory, prefix = "public") {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = `${prefix}/${entry.name}`;
    if (entry.isDirectory()) files.push(...await listFiles(new URL(`${entry.name}/`, directory), path));
    else if (entry.isFile()) files.push(path);
  }
  return files.sort();
}

test("public shell points at cache-busted local runtime assets", async () => {
  const html = await read("public/index.html");
  for (const asset of [
    "site-nav.css?v=20260713-life1",
    "styles.css?v=20260713-life1",
    "icons/life.svg?v=20260713-life1",
    "js/site-nav.js?v=20260713-life1",
    "js/app.js?v=20260713-life1",
  ]) assert.match(html, new RegExp(asset.replace(/[.?]/g, "\\$&")));
  assert.doesNotMatch(html, /<script[^>]+https?:/i);
  assert.doesNotMatch(html, /serviceWorker|manifest\.webmanifest/i);
  assert.match(html, /<noscript>/);
  assert.match(html, /id="canvas-summary" class="visually-hidden"><\/p>/);
});

test("every ES module import carries the release cache key", async () => {
  for (const file of ["public/js/app.js", "public/js/patterns.js", "public/js/share.js"]) {
    const source = await read(file);
    const imports = [...source.matchAll(/from\s+["'](\.\/[^"']+)["']/g)].map((match) => match[1]);
    assert.ok(imports.length > 0, `${file} has imports`);
    for (const specifier of imports) assert.match(specifier, /\?v=20260713-life1$/);
  }
});

test("grouped navigation keeps MusicBox first and Life last in games", async () => {
  const html = await read("public/index.html");
  const games = html.slice(html.indexOf('id="site-projects-games"'), html.indexOf('id="site-projects-edu"'));
  const musicbox = games.indexOf("MusicBox");
  const platform = games.indexOf("Platform Jumper");
  const snake = games.indexOf("Snake Autorandom");
  const ticTacToe = games.indexOf("Hard Mode Tic-Tac-Toe");
  const life = games.indexOf("Conway’s Life Lab");
  assert.ok(musicbox >= 0 && musicbox < platform && platform < snake && snake < ticTacToe && ticTacToe < life);
  assert.match(games, /href="\/gameoflife\/" aria-current="page"/);
});

test("app selects Classic Soup for fresh visits and clears malformed or stale Life hashes", async () => {
  const source = await read("public/js/app.js");
  assert.match(source, /return \{ engine: createClassicSoup\(\), label: "Classic Soup" \}/);
  assert.match(source, /if \(initial\.error\) \{\s*invalidateShareLink\(\)/);
  assert.match(source, /loaded\.lastStats = \{ births: null, deaths: null/);
  assert.ok((source.match(/invalidateShareLink\(\);/g) ?? []).length >= 10);
});

test("clipboard failure keeps the generated share link available for manual copy", async () => {
  const source = await read("public/js/app.js");
  assert.match(source, /ui\.shareOutput\.value = url;\s*window\.history\.replaceState/);
  assert.match(source, /Link ready—copy it manually from the selected field\./);
});

test("explicit transport actions announce state without making playback chatty", async () => {
  const source = await read("public/js/app.js");
  assert.match(source, /Generation \$\{engine\.generation\}\. Population \$\{engine\.population\}\./);
  assert.match(source, /Rewound to generation/);
  assert.match(source, /if \(event\.repeat\) return;/);
  assert.match(source, /!event\.ctrlKey && !event\.altKey && !event\.metaKey/);
});

test("public boundary contains only the intended static runtime", async () => {
  const expected = [
    "public/.htaccess",
    "public/icons/life.svg",
    "public/index.html",
    "public/js/app.js",
    "public/js/engine.js",
    "public/js/history.js",
    "public/js/patterns.js",
    "public/js/share.js",
    "public/js/site-nav.js",
    "public/site-nav.css",
    "public/styles.css",
  ];
  await Promise.all(expected.map((path) => access(new URL(`../${path}`, import.meta.url))));
  assert.deepEqual(await listFiles(new URL("../public/", import.meta.url)), expected.sort());
});

test("shared navigation and preserved legacy bytes match their fixed release hashes", async () => {
  assert.equal(await digest("public/site-nav.css"), "4fd818e9ecbfa76877d3b008c912fe2f9b1892eb0def01a24daa926ed688dd71");
  assert.equal(await digest("public/js/site-nav.js"), "ba32a5d679238a223fbdd0772230a30989446a86dca15eccf41b3084b4dab982");
  assert.equal(await digest("legacy/original/README.md"), "989fe7bce42e503b95af5d1fc3e9e66737cb676ccd2a7eb85a1afa63a2bbefe1");
  assert.equal(await digest("legacy/original/gameoflife.py"), "b585a5a32437e0adce964b8fccfe8e43ca87d1f77f6391cbb799bfce2d2a64f7");
});
