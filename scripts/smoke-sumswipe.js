#!/usr/bin/env node
"use strict";

var path = require("path");
var assert = require("assert");
var utils = require(path.join(__dirname, "..", "static", "js", "sumswipe.js"));

function check(name, fn) {
  try {
    fn();
    console.log("ok - " + name);
  } catch (err) {
    console.error("fail - " + name);
    console.error(err && err.stack ? err.stack : err);
    process.exitCode = 1;
  }
}

check("letterValue maps A=1 through Z=26", function () {
  assert.strictEqual(utils.letterValue("A"), 1);
  assert.strictEqual(utils.letterValue("z"), 26);
});

check("lengthFactor and wordPoints use length bonuses", function () {
  assert.strictEqual(utils.lengthFactor(3), 1);
  assert.strictEqual(utils.lengthFactor(4), 1.15);
  assert.strictEqual(utils.lengthFactor(5), 1.35);
  assert.strictEqual(utils.lengthFactor(6), 1.6);
  assert.strictEqual(utils.lengthFactor(7), 1.9);
  assert.strictEqual(utils.lengthFactor(8), 1.9);
  assert.strictEqual(utils.wordPoints("CAT"), Math.round(utils.wordSum("CAT") * 1));
  assert.strictEqual(
    utils.wordPoints("CARE"),
    Math.round(utils.wordSum("CARE") * 1.15)
  );
});

check("scoreWordsWithFill applies +15% when board is full", function () {
  var entries = [
    { word: "CAT", path: [0, 1, 2], points: 10 },
    { word: "DOG", path: [3, 4, 5], points: 20 },
  ];
  assert.strictEqual(utils.scoreWordsWithFill(entries, 24, 5), 30);
  assert.strictEqual(utils.scoreWordsWithFill(entries, 25, 5), Math.round(30 * 1.15));
});

check("isValidPath rejects reuse; pathTapAction backtracks on previous", function () {
  assert.strictEqual(utils.isValidPath([0, 1, 2], 5), true);
  assert.strictEqual(utils.isValidPath([0, 1, 0], 5), false);
  assert.strictEqual(utils.isValidPath([0, 2], 5), false);
  assert.strictEqual(utils.pathTapAction([], 0, 5), "start");
  assert.strictEqual(utils.pathTapAction([0], 1, 5), "extend");
  assert.strictEqual(utils.pathTapAction([0, 1], 0, 5), "backtrack");
  assert.strictEqual(utils.pathTapAction([0, 1, 2], 1, 5), "backtrack");
  assert.strictEqual(utils.pathTapAction([0], 12, 5), "restart");
});

check("claim helpers track occupied cells", function () {
  var claimed = {};
  assert.strictEqual(utils.countClaimed(claimed), 0);
  utils.claimPath(claimed, [0, 1, 6]);
  assert.strictEqual(utils.countClaimed(claimed), 3);
  assert.strictEqual(utils.isCellClaimed(claimed, 1), true);
  assert.strictEqual(utils.pathUsesClaimed([2, 3], claimed), false);
  assert.strictEqual(utils.pathUsesClaimed([1, 2], claimed), true);
  var rebuilt = utils.rebuildClaimedFromFound([
    { word: "CAT", path: [0, 1, 2], points: 1 },
    { word: "DOG", path: [3, 4, 5], points: 2 },
  ]);
  assert.strictEqual(utils.countClaimed(rebuilt), 6);
});

check("resolvePathWord accepts forward or reverse swipe", function () {
  var grid = utils.flattenGrid(["CATXX", "XXXXX", "XXXXX", "XXXXX", "XXXXX"]);
  assert.strictEqual(utils.resolvePathWord(grid, [0, 1, 2]).word, "CAT");
  assert.strictEqual(utils.resolvePathWord(grid, [2, 1, 0]).word, "CAT");
  assert.strictEqual(utils.resolvePathWord(grid, [2, 1, 0]).reversed, true);
});

check("focusAfterBackspace and double-tap helpers", function () {
  assert.strictEqual(utils.focusAfterBackspace([0, 1]), 1);
  assert.strictEqual(utils.focusAfterBackspace([]), null);
  assert.strictEqual(
    utils.countsTowardDoubleTap({
      gestureChangedPath: false,
      dragMoved: true,
      onPathEnd: true,
    }),
    true
  );
  assert.strictEqual(utils.isDoubleTap(1000, 600, 5, 5, 550), true);
});

check("randomPartition covers 25 with lengths 3–8", function () {
  var rand = utils.mulberry32(42);
  var part = utils.randomPartition(25, 3, 8, rand);
  assert.ok(part, "partition exists");
  var sum = part.reduce(function (a, b) {
    return a + b;
  }, 0);
  assert.strictEqual(sum, 25);
  part.forEach(function (len) {
    assert.ok(len >= 3 && len <= 8);
  });
});

check("findAllWords uses classic Boggle (no tile reuse within a word)", function () {
  var grid = utils.flattenGrid(["CATXX", "XXXXX", "XXXXX", "XXXXX", "XXXXX"]);
  var sol = utils.findAllWords(grid, 5);
  assert.ok(sol.words.indexOf("CAT") !== -1);
  assert.strictEqual(utils.isValidPath([0, 1, 0], 5), false);
});

check("sanitizeFoundEntries drops overlaps and rebuilds claimed", function () {
  var grid = utils.flattenGrid(["CATXX", "DOGXX", "XXXXX", "XXXXX", "XXXXX"]);
  var valid = { CAT: true, DOG: true };
  var cleaned = utils.sanitizeFoundEntries(
    [
      { word: "CAT", path: [0, 1, 2] },
      { word: "DOG", path: [5, 6, 7] },
      { word: "CAT", path: [0, 1, 2] },
      { word: "DOG", path: [7, 6, 5] },
    ],
    grid,
    5,
    valid
  );
  assert.strictEqual(cleaned.found.length, 2);
  assert.strictEqual(utils.countClaimed(cleaned.claimed), 6);
});

check("daily 5×5 grid deterministic, seed fill covers all cells", function () {
  utils.clearPuzzleCache();
  var t0 = Date.now();
  var a = utils.generateGrid("2026-08-08", 5);
  var firstMs = Date.now() - t0;
  var b = utils.generateGrid("2026-08-08", 5);
  assert.strictEqual(a, b, "cached puzzle object reused");
  assert.strictEqual(a.size, 5);
  assert.strictEqual(a.grid.length, 25);
  assert.ok(a.seedWords && a.seedWords.length >= 3, "has seed partition");
  var seedClaimed = utils.rebuildClaimedFromFound(a.seedWords);
  assert.strictEqual(utils.countClaimed(seedClaimed), 25, "seed covers all cells");
  assert.ok(a.wordCount >= 5, "wordCount " + a.wordCount);
  console.log(
    "note - generateGrid first call " +
      firstMs +
      "ms, wordCount=" +
      a.wordCount
  );
  assert.ok(firstMs < 8000, "first generateGrid should finish in a few seconds");
});

check("puzzle cache speeds repeat generateGrid", function () {
  utils.clearPuzzleCache();
  utils.generateGrid("2026-08-01", 5);
  var t1 = Date.now();
  utils.generateGrid("2026-08-01", 5);
  var second = Date.now() - t1;
  assert.ok(second < 20, "cached generate should be near-instant, got " + second + "ms");
});

check("date helpers including history bound", function () {
  assert.strictEqual(utils.shiftDateKey("2026-08-08", -1), "2026-08-07");
  assert.strictEqual(utils.todayKey(new Date(2026, 7, 8)), "2026-08-08");
  assert.strictEqual(utils.earliestDateKey(new Date(2026, 7, 8)), "2025-08-08");
  assert.strictEqual(utils.MAX_HISTORY_DAYS, 365);
  assert.strictEqual(utils.GRID_SIZE, 5);
  assert.strictEqual(utils.FILL_BONUS, 0.15);
});

if (!process.exitCode) {
  console.log("All SumSwipe smoke tests passed.");
}
